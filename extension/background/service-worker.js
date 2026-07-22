const api = typeof browser !== 'undefined' ? browser : chrome;

importScripts("../lib/debug-log.js");
const { logEvent, redactToken } = SecDebugLog;

// ---------------------------------------------------------------------------
// Cold-start pre-warm
//
// In MV3 the service worker terminates ~30s after the last event. The first
// sendMessage() from a freshly-opened popup is supposed to spin the SW back
// up, but the message can land during the spin-up window and be silently
// dropped, surfacing as `chrome.runtime.lastError` "The message port closed
// before a response was received." in the popup. To avoid that race:
//   1. Touch storage.session on onInstalled/onStartup so the SW is alive
//      before the first user action.
//   2. Hold a no-op keepalive for a few seconds after onInstalled so
//      in-flight start-up messages have a chance to land.
// The real listener registration (api.runtime.onMessage.addListener) below is
// synchronous at top level — it'll be active before the first message could
// realistically be sent, because onInstalled fires synchronously and the SW
// stays alive until the keepalive timer fires.
// ---------------------------------------------------------------------------
api.runtime.onInstalled.addListener(() => {
  try { logEvent("sw-startup", "onInstalled fired"); } catch {}
  // Force storage.session access — keeps SW alive for the keepalive window
  api.storage.session.get("__sw_keepalive").catch(() => {});
});
api.runtime.onStartup.addListener(() => {
  try { logEvent("sw-startup", "onStartup fired"); } catch {}
  api.storage.session.get("__sw_keepalive").catch(() => {});
});

// Auto-inject content script whenever a Cisco dashboard tab loads/reloads
api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = tab.url || changeInfo.url || "";
  if (url.includes("cisco.com")) {
    api.scripting.executeScript({
      target: { tabId },
      files: ["content/content-script.js"]
    }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Token storage
//
// Tokens are stored as OBJECTS, not bare strings: { token, capturedAt,
// source }, one per tokenKey. Cisco mints separately-scoped, separately-aged
// Bearer tokens per API host — confirmed live against org 8176184:
//   - sse_token        — api.sse.cisco.com / api.umbrella.com (original path)
//   - mgmt_authz_token — management.api.umbrella.com (issuer
//                        "umbrella-authz/authsvc", scope "role:root-readonly",
//                        ~5min TTL; serves both all_tag_identities/
//                        security_group_tag and .../catalyst_sdwan — same
//                        token, confirmed byte-for-byte identical JWT across
//                        both live-captured requests)
//   - opendns_token    — api.opendns.com (aud "https://api.opendns.com/v3/",
//                        only ~60s TTL — used for v3/organizations/{orgId}/
//                        internalnetworks)
// Each is tracked independently under its own chrome.storage.session key
// (the tokenKey itself), with its own staleness threshold in TOKEN_REGISTRY,
// since a 45s margin that's sane for opendns_token would be nonsense applied
// to sse_token and vice versa.
//
// Two independent capture paths can write any of them:
//   - "webrequest"       — the passive api.webRequest.onBeforeSendHeaders
//                           listener below (kept as a redundant fallback).
//   - "main-world-patch" — content/token-sniffer.js (MAIN world, patches
//                           fetch/XHR) relayed via content/token-relay.js
//                           and the TOKEN_CAPTURED message handler further
//                           down. This is the primary path, added to fix the
//                           MV3 service-worker cold-start race: it runs
//                           synchronously at document_start in the page's
//                           own realm, so it can't lose the race against the
//                           SW's webRequest listener re-registering after
//                           waking from idle.
//
// Whichever capture fires most recently wins (last-write-wins by
// capturedAt timestamp) — storeToken() below is the single write path for
// both sources, so this rule is enforced in one place.
// ---------------------------------------------------------------------------

const TOKEN_REGISTRY = {
  sse_token:        { maxAgeMs: 10 * 60 * 1000 }, // 10 min — starting point; real TTL not yet observed to expire in testing
  mgmt_authz_token: { maxAgeMs: 290 * 1000 },     // real TTL ~5min (300s) per JWT exp/iat — 10s margin
  opendns_token:    { maxAgeMs: 55 * 1000 },       // real TTL ~60s per JWT exp/iat — 5s margin (was 45s, too aggressive)
};

// url -> tokenKey, checked in order. Host-specific patterns must be checked
// before the broader (api\.sse\.cisco\.com|api\.umbrella\.com) one, since
// management.api.umbrella.com would also match a naive /umbrella\.com/-style
// regex.
const TOKEN_HOST_MAP = [
  { pattern: /^https:\/\/management\.api\.umbrella\.com\//, tokenKey: "mgmt_authz_token" },
  { pattern: /^https:\/\/api\.opendns\.com\//, tokenKey: "opendns_token" },
  { pattern: /^https:\/\/(api\.sse\.cisco\.com|api\.umbrella\.com)\//, tokenKey: "sse_token" },
];

function tokenKeyForUrl(url) {
  if (typeof url !== "string") return null;
  for (const entry of TOKEN_HOST_MAP) {
    if (entry.pattern.test(url)) return entry.tokenKey;
  }
  return null;
}

async function storeToken(tokenKey, token, source, capturedAt, meta) {
  meta = meta || {};
  // Use chrome.storage.local so tokens survive MV3 service-worker termination
  // (~30s idle timeout). session storage is wiped on restart, which makes
  // identity resolution impossible when navigating between dashboard pages.
  const ST = api.storage.local;
  const result = await ST.get(tokenKey);
  const existing = result[tokenKey]; // { token, capturedAt, source } | undefined

  if (existing && existing.capturedAt >= capturedAt) {
    logEvent("token-capture", "Ignored (existing stored token is same age or newer)", {
      tokenKey, source, capturedAt, existingSource: existing.source, existingCapturedAt: existing.capturedAt,
    });
    return;
  }

  const ageSinceLastMs = existing ? capturedAt - existing.capturedAt : null;
  await ST.set({ [tokenKey]: { token, capturedAt, source } });

  const redacted = redactToken(token);
  logEvent("token-capture", "Token captured/updated", {
    tokenKey, source, url: meta.url || null, ageSinceLastMs,
    length: redacted.length, prefix: redacted.prefix,
  });

  // ── Fetch-on-token-capture ───────────────────────────────────────────
  // Every fresh token triggers a debounced full data fetch. Multiple tokens
  // arriving in quick succession (dashboard mints 2-3 within seconds) only
  // produce ONE fetch after the debounce window.
  _scheduleFetch();
}

// ---------------------------------------------------------------------------
// Auto-fetch: the moment a token is captured, fetch ALL data (rules,
// identities, objects, app lists) and store results in chrome.storage.local.
// Popup reads from there — no scan-trigger needed from the popup side.
//
// Debounced: rapid token arrivals (2-3 within seconds) batch into one fetch.
// Periodic: after each successful fetch, a 20-minute alarm is set to refetch.
// ---------------------------------------------------------------------------

const REFRESH_ALARM = "psc-periodic-refresh";
const REFRESH_INTERVAL_MIN = 20;

let _fetchInProgress = false;
let _fetchQueued = false;
let _lastFetchAt = 0;
const MIN_FETCH_INTERVAL_MS = 3000; // 3s throttle — prevents rapid-fire fetches

function _scheduleFetch() {
  // Direct call with timestamp throttle. We avoid chrome.alarms for the
  // debounce because MV3 SW alarms have minimum 30s granularity and may
  // not fire reliably in all contexts. The 20-min REFRESH_ALARM handles
  // periodic refreshes separately.
  const now = Date.now();
  if (now - _lastFetchAt < MIN_FETCH_INTERVAL_MS) return;
  _lastFetchAt = now;
  fetchAllData().catch(err => {
    logEvent("auto-fetch", "fetchAllData failed", { error: err.message });
  });
}

async function fetchAllData(explicitOrgId) {
  if (_fetchInProgress) {
    _fetchQueued = true;
    return;
  }
  _fetchInProgress = true;
  const startTime = Date.now();

  try {
    logEvent("auto-fetch", "fetchAllData started");

    // 1. Get orgId
    let orgId = explicitOrgId;
    if (!orgId) {
      try { orgId = await getActiveOrgId(); } catch {}
    }
    if (!orgId) {
      const cached = await api.storage.local.get("cached_org_id");
      orgId = cached.cached_org_id;
    }
    if (!orgId) {
      logEvent("auto-fetch", "No orgId available, skipping fetch");
      return;
    }

    // 2. Get tabId for on-demand token checks
    let tabId = null;
    try {
      const tabs = await api.tabs.query({ active: true, currentWindow: true });
      tabId = tabs[0]?.id;
    } catch {}

    // 3. Fetch rules (needs sse_token)
    let rules = null;
    try {
      const tokenObj = await getFreshToken("sse_token", tabId);
      if (tokenObj) {
        rules = await fetchRules(tokenObj.token, orgId);
        const findings = runChecks(rules);
        await api.storage.local.set({ sse_rules: rules, sse_findings: findings });
        logEvent("auto-fetch", "Rules fetched", { count: rules.length, findings: findings.length });
      } else {
        logEvent("auto-fetch", "No sse_token available, skipping rules fetch");
      }
    } catch (err) {
      logEvent("auto-fetch", "Rules fetch failed", { error: err.message });
    }

    // If no rules fetched, use stored rules for identity/object resolution
    if (!rules) {
      const stored = await api.storage.local.get("sse_rules");
      rules = stored.sse_rules || [];
    }
    if (rules.length === 0) {
      logEvent("auto-fetch", "No rules available, stopping");
      return;
    }

    // 4. Resolve identities (needs mgmt_authz_token)
    try {
      const identityMap = await resolveIdentities(rules, orgId, tabId);
      if (Object.keys(identityMap).length > 0) {
        await api.storage.local.set({ sse_identity_map: identityMap });
        logEvent("auto-fetch", "Identities resolved", { count: Object.keys(identityMap).length });
      } else {
        logEvent("auto-fetch", "Empty identity map — keeping previous data if any");
      }
    } catch (err) {
      logEvent("auto-fetch", "Identity resolution failed", { error: err.message });
    }

    // 5. Resolve identity types (needs mgmt_authz_token)
    try {
      const identityTypeMap = await resolveIdentityTypes(orgId, tabId, rules);
      if (Object.keys(identityTypeMap).length > 0) {
        await api.storage.local.set({ sse_identity_type_map: identityTypeMap });
        logEvent("auto-fetch", "Identity types resolved", { count: Object.keys(identityTypeMap).length });
      }
    } catch (err) {
      logEvent("auto-fetch", "Identity type resolution failed", { error: err.message });
    }

    // 6. Resolve objects (needs various tokens)
    try {
      const objectMaps = await resolveObjectRefs(orgId, tabId, rules);
      // Merge with existing data — don't let a partial failure wipe good data
      const prev = await api.storage.local.get("sse_object_maps");
      const prevMaps = (prev && prev.sse_object_maps) || {};
      for (const [key, map] of Object.entries(objectMaps)) {
        if (Object.keys(map).length === 0 && prevMaps[key] && Object.keys(prevMaps[key]).length > 0) {
          objectMaps[key] = prevMaps[key];
        }
      }
      await api.storage.local.set({ sse_object_maps: objectMaps });
      const totalObjects = Object.values(objectMaps).reduce((sum, m) => sum + Object.keys(m).length, 0);
      logEvent("auto-fetch", "Objects resolved", { total: totalObjects });
    } catch (err) {
      logEvent("auto-fetch", "Object resolution failed", { error: err.message });
    }

    // 7. Schedule next periodic refresh
    api.alarms.create(REFRESH_ALARM, { delayInMinutes: REFRESH_INTERVAL_MIN });

    logEvent("auto-fetch", "fetchAllData completed", { durationMs: Date.now() - startTime, orgId });
  } finally {
    _fetchInProgress = false;
    if (_fetchQueued) {
      _fetchQueued = false;
      fetchAllData().catch(err => {
        logEvent("auto-fetch", "Queued fetchAllData failed", { error: err.message });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Token interception — fallback path (see comment above). Passive/
// non-blocking: never modifies or blocks the request. One listener covers
// all four hosts; tokenKeyForUrl() sorts out which stored token a given
// request's Authorization header belongs to.
// ---------------------------------------------------------------------------

api.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    for (const header of details.requestHeaders) {
      if (header.name.toLowerCase() === "authorization") {
        if (header.value.startsWith("Bearer ")) {
          const tokenKey = tokenKeyForUrl(details.url);
          if (tokenKey) {
            const token = header.value.slice(7);
            storeToken(tokenKey, token, "webrequest", Date.now(), { url: details.url });
          }
        }
        break;
      }
    }
  },
  {
    urls: [
      "https://api.sse.cisco.com/*",
      "https://api.umbrella.com/*",
      "https://management.api.umbrella.com/*",
      "https://api.opendns.com/*",
    ],
  },
  ["requestHeaders"]
);

// ---------------------------------------------------------------------------
// Helper: determine the active organization ID from the current tab's URL.
// Dashboard URLs look like https://dashboard.sse.cisco.com/org/{orgId}/...
// ---------------------------------------------------------------------------

async function getActiveOrgId() {
  // First try the active tab's URL
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url || "";
  const match = url.match(/\/org\/(\d+)/);
  if (match) {
    return match[1];
  }
  
  // Fallback: check cached org ID from storage (set by content-script.js when it detects the URL)
  const data = await api.storage.local.get("cached_org_id");
  if (data.cached_org_id) {
    return data.cached_org_id;
  }
  
  throw new Error(
    "Could not determine organization ID from the active tab. Open the Secure Access dashboard (e.g. https://dashboard.sse.cisco.com/org/<orgId>/secure/policy) and try again."
  );
}

// ---------------------------------------------------------------------------
// Helper: fetch rules from the SSE API
// ---------------------------------------------------------------------------

async function fetchRules(token, orgId) {
  // ---- Live API path -------------------------------------------------------
  // NOTE: /v2/access/rules is a placeholder. Confirm the exact endpoint URL
  // by inspecting the Network tab in DevTools on the real SSE dashboard, then
  // update BASE_URL and the path below accordingly.
  const BASE_URL = "https://api.umbrella.com";
  const ORG_ID = orgId;
  const LIMIT = 100;
  let offset = 0;
  let allRules = [];
  let retries = 0;
  const MAX_RETRIES = 3;

  // No ruleIsDefault filter — default/catch-all rules (e.g. "All private
  // applications" - Block, "All Internet access" - Allow) are real, active
  // rules that affect traffic decisions and must be visible to the matcher
  // and checks, not silently excluded.
  //
  // UNVERIFIED: default rules' exact response shape (field completeness,
  // whether rulePriority is populated/meaningful for them, etc.) has not
  // been confirmed via a live fetch — the normalize step below relies on
  // the same defensive fallback chains already used for custom rules
  // (raw.sources || raw.source || ["any"], etc.), which should degrade
  // gracefully if default rules turn out to have fewer fields, but this
  // should be re-checked against real API output.
  while (true) {
    const url = `${BASE_URL}/v1/sse/organizations/${ORG_ID}/rules?offset=${offset}&limit=${LIMIT}`;
    let response;
    const startedAt = Date.now();

    try {
      response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });
      logEvent("rules-fetch", "API response", { url, status: response.status, latencyMs: Date.now() - startedAt });
    } catch (networkErr) {
      console.error("[fetchRules] fetch failed:", networkErr);
      logEvent("rules-fetch", "Network error", { url, error: networkErr.message, latencyMs: Date.now() - startedAt });
      throw new Error(`Network error fetching rules: ${networkErr.message}`);
    }

    // Handle rate limiting
    if (response.status === 429) {
      if (retries >= MAX_RETRIES) {
        throw new Error("Rate limit hit — max retries exceeded");
      }
      const retryAfter = parseInt(response.headers.get("Retry-After") || "5");
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      retries++;
      continue; // retry same page
    }

    // 401 specifically means the token is expired/invalid — surfaced to
    // RUN_SCAN as a distinguishable error (err.isAuthError) so it can clear
    // the stale token and return a structured TOKEN_STALE response instead
    // of the raw Cisco error string.
    if (response.status === 401) {
      const body = await response.text().catch(() => "");
      logEvent("rules-fetch", "401 — token expired/invalid", { url, body: body.slice(0, 200) });
      const authErr = new Error(`API error 401 fetching rules: ${body.slice(0, 200)}`);
      authErr.isAuthError = true;
      throw authErr;
    }

    // Handle other non-2xx errors
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logEvent("rules-fetch", "API error", { url, status: response.status, body: body.slice(0, 200) });
      throw new Error(
        `API error ${response.status} fetching rules: ${body.slice(0, 200)}`
      );
    }

    // Reset retry counter on success
    retries = 0;

    const data = await response.json();

    // Handle both array response and wrapped response shapes.
    // The real API returns { rules: [...] }.
    const pageRules = Array.isArray(data)
      ? data
      : (data.rules || data.data || data.items || []);

    // Normalize each raw rule into our internal shape.
    // API response shape is not yet confirmed.
    const normalized = pageRules.map(raw => {
      let ruleActionStr = raw.ruleAction || raw.action;
      if (!ruleActionStr) {
        console.warn(`[fetchRules] Rule ${raw.ruleId || raw.id || "unknown"} has no ruleAction/action, defaulting to allow`);
        ruleActionStr = "allow";
      }

      const ruleSettings = raw.ruleSettings || [];
      const getSetting = (name) => ruleSettings.find(s => s.settingName === name)?.settingValue;

      let loggingEnabled = true;
      if (raw.ruleSettings) {
        const logLevel = getSetting("umbrella.logLevel");
        // Assume missing or "NONE" means logging is off. LOG_ALL means on.
        loggingEnabled = logLevel !== undefined && logLevel !== "NONE";
      } else {
        // Fallback for mock payload
        loggingEnabled = raw.logging_enabled !== false && raw.loggingEnabled !== false;
      }

      // Security profiles — resolved from ruleSettings using confirmed Cisco API settingName keys.
      // Confirmed live API settingNames:
      //   - IPS: "umbrella.posture.ipsProfileId"
      //   - TLS / Web Inspection: "umbrella.posture.webProfileId"
      //   - AMP / Client Posture: "umbrella.posture.profileIdClientbased" / "umbrella.posture.profileIdClientless"
      //   - Tenant Control / DLP: "sse.tenantControlProfileId"
      const getProfile = (realSettingName, altNames) => {
        if (raw.ruleSettings) {
          let val = getSetting(realSettingName);
          if (val === undefined && altNames) {
            for (const alt of altNames) {
              val = getSetting(alt);
              if (val !== undefined) break;
            }
          }
          if (val !== undefined && val !== null && val !== "" && val !== false && val !== "DISABLED" && val !== "NONE") {
            return true;
          }
          return false;
        }
        return false;
      };

      return {
      id: raw.ruleId !== undefined ? raw.ruleId : (raw.id || String(Math.random())),
      name: raw.ruleName || raw.name || "Unnamed Rule",
      order: typeof raw.rulePriority === "number" ? raw.rulePriority : (typeof raw.order === "number" ? raw.order : parseInt(raw.rulePriority || raw.order || "0")),
      action: ruleActionStr.toLowerCase(),
      enabled: raw.ruleIsEnabled !== undefined ? raw.ruleIsEnabled : (raw.enabled !== false),
      is_default: raw.ruleIsDefault === true,
      sources: raw.sources || raw.source || ["any"],
      destinations: raw.destinations || raw.destination || ["any"],
      applications: raw.applications || raw.application || [],
      ports: raw.ports || raw.port || ["any"],
      protocol: raw.protocol || "any",
      conditions: raw.conditions || raw.ruleConditions || [],
      logging_enabled: loggingEnabled,
      security_profiles: {
        ips_enabled: getProfile("umbrella.posture.ipsProfileId", ["umbrella.security.ips", "ips_enabled"]),
        amp_malware_enabled: getProfile("umbrella.posture.profileIdClientbased", ["umbrella.posture.profileIdClientless", "umbrella.security.amp", "amp_malware_enabled"]),
        tls_decryption_enabled: getProfile("umbrella.posture.webProfileId", ["umbrella.security.tls", "tls_decryption_enabled"]),
        dlp_enabled: getProfile("sse.tenantControlProfileId", ["umbrella.security.dlp", "dlp_enabled"]),
      },
      raw: raw
    };
    });

    allRules = allRules.concat(normalized);

    // Stop paginating when we get fewer results than the page limit
    if (pageRules.length < LIMIT) break;
    offset += LIMIT;
  }

  return allRules;
}

// ---------------------------------------------------------------------------
// compareRulePriority — sort comparator used everywhere rule evaluation
// order matters.
//
// Default/catch-all rules must always sort LAST, regardless of whatever
// rulePriority value the API assigns them — this is a policy invariant
// (defaults only apply when no custom rule matched), not something derived
// from the priority number, which may or may not even be meaningful for
// default rules (unverified — see fetchRules() note above).
// ---------------------------------------------------------------------------

function compareRulePriority(a, b) {
  if (a.is_default !== b.is_default) return a.is_default ? 1 : -1;
  return a.order - b.order;
}

// ---------------------------------------------------------------------------
// Check helpers
//
// BUG FIX (found investigating 13 false-positive conflicting-rules findings
// on org 8176184's real 33-rule set): the old versions of these helpers
// compared rule.sources/destinations/applications/ports/protocol — fields
// that only ever populate from mock-shaped payloads (fetchRules() always
// hits the live API now). The real Umbrella/SSE API expresses all rule scope
// through ruleConditions (normalized to rule.conditions below), so for every
// real rule those flat fields fell through their `|| ["any"]` / `|| []`
// fallbacks identically — every rule in an org looked like
// sources=["any"], destinations=["any"], applications=[], ports=["any"],
// protocol="any", regardless of its actual conditions. That made
// _matchCriteriaEqual() trivially true for every pair of real rules, so
// checkConflicts() degenerated into "flag every pair with different
// actions" — explaining exactly the "Enterprise Browser - HR Private App
// conflicts with 13 unrelated rules" symptom. checkShadowing()'s
// _isBroadOrEqual() and checkInspection()'s isBroad had the identical
// defect (always true).
//
// Fix: derive real per-dimension scope from rule.conditions itself, using
// the same source/destination/identity/app dimension split matcher.js uses
// for the Policy Tester (duplicated here, not shared — matcher.js's IIFE
// hardcodes `window`, which doesn't exist in this service worker context).
// Ports/protocol are dropped as a separate dimension: the real schema
// doesn't expose them as top-level fields either (they're bundled inside
// composite_inline_ip destination conditions per matcher.js's confirmed
// schema notes), so pretending to compare them separately would just
// reintroduce the same kind of fictional-field bug.
// ---------------------------------------------------------------------------

function _conditionDimension(attributeName) {
  const an = (attributeName || "").toLowerCase();
  if (an === "umbrella.source.all") return "source";
  if (an === "umbrella.destination.all") return "destination";
  if (an === "umbrella.destination.composite_inline_ip") return "destination";
  if (an === "umbrella.source.composite_inline_ip") return "source";
  if (an.includes("identity")) return "identity";
  if (an.includes("application") || an.includes("app") || an.includes("protocol") || an.includes("category")) return "app";
  // CONFIRMED via live API payload (org 8176184): umbrella.destination.destination_list_ids
  // is a real destination-scoped condition (a user-defined "destination list").
  // "geo" is an unconfirmed generalization for geo-blocking-style conditions
  // (e.g. Geoblocking2), included defensively since they're also destination-scoped.
  if (an.includes("destination_list") || an.includes("geo")) return "destination";
  return "unknown";
}

function _isCatchAllCondition(cond) {
  return cond.attributeValue === true && (cond.attributeName || "").toLowerCase().endsWith(".all");
}

function _bucketConditionsByDimension(rule) {
  const conds = rule.conditions || rule.ruleConditions || [];
  const buckets = { source: [], destination: [], identity: [], app: [], unknown: [] };
  for (const c of conds) buckets[_conditionDimension(c.attributeName)].push(c);
  return buckets;
}

// Stable, order-independent string form of a condition list, for equality
// comparisons — real APIs don't guarantee condition array order is
// meaningful, so two rules with the same conditions in a different order
// must still compare equal.
function _canonicalConditionSet(conds) {
  return JSON.stringify(
    [...conds]
      .map((c) => ({ n: c.attributeName, o: c.attributeOperator || "=", v: c.attributeValue }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  );
}

function _dimensionUnconstrained(conds) {
  return conds.length === 0 || (conds.length === 1 && _isCatchAllCondition(conds[0]));
}

// Used by checkShadowing: is `blocker`'s scope on this dimension broader
// than or equal to `rule`'s (i.e. blocker matches everything rule matches,
// on this one dimension)?
function _dimensionBroadOrEqual(blockerConds, ruleConds) {
  if (_dimensionUnconstrained(blockerConds)) return true;
  return _canonicalConditionSet(blockerConds) === _canonicalConditionSet(ruleConds);
}

// Used by checkShadowing: true only if blocker is broader-or-equal on
// EVERY dimension (source, destination, identity, app, unknown).
//
// BUG FIX (found investigating 6 false-positive conflicting-rules findings
// on "Geoblocking2", org 8176184): this used to only check source/
// destination/identity/app, silently skipping the "unknown" bucket — any
// condition type _conditionDimension() doesn't recognize (e.g.
// destination_list_ids before the fix above) landed in "unknown" and was
// never compared at all. Two rules with completely different unrecognized
// conditions (different destination list IDs, in Geoblocking2's case) both
// had empty source/destination/identity/app buckets, so they looked
// "identical" regardless of what their real (ignored) condition said —
// reproducing the exact same class of false positive the org 8176184
// investigation already fixed once, via a different mechanism. Comparing
// "unknown" too closes this gap generally, not just for destination_list_ids
// specifically — there will always be condition types _conditionDimension()
// doesn't yet recognize.
function _matchCriteriaBroadOrEqual(blocker, rule) {
  const bB = _bucketConditionsByDimension(blocker);
  const bR = _bucketConditionsByDimension(rule);
  return (
    _dimensionBroadOrEqual(bB.source, bR.source) &&
    _dimensionBroadOrEqual(bB.destination, bR.destination) &&
    _dimensionBroadOrEqual(bB.identity, bR.identity) &&
    _dimensionBroadOrEqual(bB.app, bR.app) &&
    _dimensionBroadOrEqual(bB.unknown, bR.unknown)
  );
}

// Used by checkConflicts: true only if a and b have IDENTICAL scope on
// EVERY dimension (including "unknown" — see the bug-fix comment above
// _matchCriteriaBroadOrEqual) — genuine overlap, not just "neither is
// unconstrained".
function _matchCriteriaEqual(a, b) {
  const bA = _bucketConditionsByDimension(a);
  const bB = _bucketConditionsByDimension(b);
  return (
    _canonicalConditionSet(bA.source) === _canonicalConditionSet(bB.source) &&
    _canonicalConditionSet(bA.destination) === _canonicalConditionSet(bB.destination) &&
    _canonicalConditionSet(bA.identity) === _canonicalConditionSet(bB.identity) &&
    _canonicalConditionSet(bA.app) === _canonicalConditionSet(bB.app) &&
    _canonicalConditionSet(bA.unknown) === _canonicalConditionSet(bB.unknown)
  );
}

function _fullyCriticalEqual(a, b) {
  return a.action === b.action && _matchCriteriaEqual(a, b);
}

// ---------------------------------------------------------------------------
// Check: permissive
// ---------------------------------------------------------------------------

function checkPermissive(rules) {
  const findings = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.action !== "allow") continue;
    const srcAny = JSON.stringify(rule.sources) === JSON.stringify(["any"]);
    const dstAny = JSON.stringify(rule.destinations) === JSON.stringify(["any"]);
    const appAny =
      rule.applications.length === 0 ||
      JSON.stringify(rule.applications) === JSON.stringify(["any"]);
    const condEmpty = rule.conditions.length === 0;
    if (srcAny && dstAny && appAny && condEmpty) {
      findings.push({
        checkId: "overly-permissive",
        severity: "critical",
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Rule '${rule.name}' allows any-to-any traffic with no conditions.`,
        detail:
          "Sources, destinations, and applications are all unrestricted with no extra conditions. This rule permits all traffic.",
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Check: shadowing
// ---------------------------------------------------------------------------

function checkShadowing(rules) {
  const sorted = [...rules].sort(compareRulePriority);
  const findings = [];

  for (let i = 0; i < sorted.length; i++) {
    const rule = sorted[i];
    if (!rule.enabled) continue;
    // Default/catch-all rules are BY DESIGN only reached when nothing else
    // matched — being "shadowed" by any earlier custom rule with the same
    // action is the expected, intended behavior, not a policy mistake. Flag
    // it here would just be noise on every org that has any custom rules.
    if (rule.is_default) continue;

    for (let j = 0; j < i; j++) {
      const blocker = sorted[j];
      if (!blocker.enabled) continue;

      if (
        blocker.action === rule.action &&
        _matchCriteriaBroadOrEqual(blocker, rule)
      ) {
        findings.push({
          checkId: "shadowing",
          severity: "high",
          ruleId: rule.id,
          ruleName: rule.name,
          message: `Rule '${rule.name}' is shadowed by earlier rule '${blocker.name}' and will never be evaluated.`,
          detail: `Rule '${blocker.name}' (order ${blocker.order}) has broader or equal match criteria and the same action, so '${rule.name}' (order ${rule.order}) can never be reached first.`,
        });
        break;
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Check: conflicts
// ---------------------------------------------------------------------------

function checkConflicts(rules) {
  const sorted = [...rules].sort(compareRulePriority);
  const findings = [];

  for (let i = 0; i < sorted.length; i++) {
    const ruleA = sorted[i];
    if (!ruleA.enabled) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const ruleB = sorted[j];
      if (!ruleB.enabled) continue;
      // A custom rule differing in action from the org's default/catch-all
      // fallback (e.g. Block rule vs. the "All Internet access" - Allow
      // default) is normal, intended design — the specific rule is SUPPOSED
      // to override the broad default. Not a real policy conflict. Same
      // reasoning as the is_default guards in checkShadowing/checkDuplicates.
      if (ruleA.is_default || ruleB.is_default) continue;

      if (_matchCriteriaEqual(ruleA, ruleB) && ruleA.action !== ruleB.action) {
        findings.push({
          checkId: "conflicting-rules",
          severity: "high",
          ruleId: ruleA.id,
          ruleName: ruleA.name,
          message:
            "Rule conflicts with another rule that has the same match criteria but opposite action.",
          detail: `Rule '${ruleA.name}' (order ${ruleA.order}) has the same match criteria as '${ruleB.name}' (order ${ruleB.order}) but action '${ruleA.action}' vs '${ruleB.action}'.`,
        });
        findings.push({
          checkId: "conflicting-rules",
          severity: "high",
          ruleId: ruleB.id,
          ruleName: ruleB.name,
          message:
            "Rule conflicts with another rule that has the same match criteria but opposite action.",
          detail: `Rule '${ruleB.name}' (order ${ruleB.order}) has the same match criteria as '${ruleA.name}' (order ${ruleA.order}) but action '${ruleB.action}' vs '${ruleA.action}'.`,
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Check: duplicates
// ---------------------------------------------------------------------------

function checkDuplicates(rules) {
  const sorted = [...rules].sort(compareRulePriority);
  const findings = [];

  for (let i = 0; i < sorted.length; i++) {
    const ruleA = sorted[i];
    if (!ruleA.enabled) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const ruleB = sorted[j];
      if (!ruleB.enabled) continue;
      // A default rule "duplicating" a custom rule isn't a real duplicate-rule
      // problem — defaults are Cisco's fixed catch-all, not something the org
      // configured redundantly, and it will always sort after custom rules
      // (see compareRulePriority), so it never "wins" over a real duplicate.
      if (ruleB.is_default) continue;

      if (_fullyCriticalEqual(ruleA, ruleB)) {
        findings.push({
          checkId: "duplicate-rule",
          severity: "low",
          ruleId: ruleB.id,
          ruleName: ruleB.name,
          message:
            "Rule is an exact duplicate of an earlier rule and will never be reached first.",
          detail: `Rule '${ruleB.name}' (order ${ruleB.order}) is an exact duplicate of '${ruleA.name}' (order ${ruleA.order}). The earlier rule will always match first.`,
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Check: logging
// ---------------------------------------------------------------------------

function checkLogging(rules) {
  const findings = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.logging_enabled === false) {
      findings.push({
        checkId: "logging-disabled",
        severity: "medium",
        ruleId: rule.id,
        ruleName: rule.name,
        message:
          "Rule has logging disabled — its traffic is invisible for audit and incident response.",
        detail: null,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Check: inspection
// ---------------------------------------------------------------------------

function checkInspection(rules) {
  const findings = [];

  const profileKeys = [
    { field: "ips_enabled", label: "ips" },
    { field: "amp_malware_enabled", label: "amp_malware" },
    { field: "tls_decryption_enabled", label: "tls_decryption" },
    { field: "dlp_enabled", label: "dlp" },
  ];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.action !== "allow") continue;

    // Same fictional-field bug as checkConflicts/checkShadowing — real
    // scope must come from rule.conditions, not the mock-only sources/
    // destinations placeholder fields (see the big comment above
    // _conditionDimension).
    const buckets = _bucketConditionsByDimension(rule);
    const isBroad =
      _dimensionUnconstrained(buckets.source) || _dimensionUnconstrained(buckets.destination);
    if (!isBroad) continue;

    const sp = rule.security_profiles || {};
    const missing = profileKeys
      .filter(({ field }) => sp[field] === false)
      .map(({ label }) => label);

    if (missing.length > 0) {
      findings.push({
        checkId: "inspection-bypass",
        severity: "high",
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Rule bypasses security inspection. Missing: ${missing.join(", ")}`,
        detail: `Rule '${rule.name}' has broad match criteria (any source or destination) but the following inspection profiles are disabled: ${missing.join(", ")}.`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Engine: run all checks
// ---------------------------------------------------------------------------

function runChecks(rules) {
  const sorted = [...rules].sort(compareRulePriority);

  const findings = [
    ...checkPermissive(sorted),
    ...checkShadowing(sorted),
    ...checkConflicts(sorted),
    ...checkDuplicates(sorted),
    ...checkLogging(sorted),
    ...checkInspection(sorted),
  ];

  return findings;
}

// ---------------------------------------------------------------------------
// getFreshToken — used by RUN_SCAN and resolveIdentities(). Returns the
// stored token object for the given tokenKey if it's present and within
// that token's own TOKEN_REGISTRY maxAgeMs. If missing/stale, asks the
// active tab's content/token-relay.js for the MAIN-world patch's last-seen
// token for that specific tokenKey (REQUEST_TOKEN_CHECK) before giving up —
// covers the case where a request fired very recently but the
// postMessage->sendMessage->storage chain hasn't finished propagating yet.
// Returns null if nothing valid is found.
// ---------------------------------------------------------------------------

async function getFreshToken(tokenKey, tabId) {
  const maxAgeMs = (TOKEN_REGISTRY[tokenKey] || TOKEN_REGISTRY.sse_token).maxAgeMs;
  // Read from local storage (tokens survive SW restarts). storeToken() was
  // changed to use storage.local for the same reason — see storeToken().
  const result = await api.storage.local.get(tokenKey);
  const stored = result[tokenKey]; // { token, capturedAt, source } | undefined
  const now = Date.now();
  const isStale = !stored || (now - stored.capturedAt) > maxAgeMs;

  if (!isStale) return stored;

  logEvent("token-check", "Stored token missing/stale — trying proactive fetch", {
    tokenKey, hadStored: !!stored, ageMs: stored ? now - stored.capturedAt : null, tabId,
  });

  if (!tabId) return null;

  // Phase 1: try passive on-demand check first (fast path — maybe the
  // MAIN-world patch already saw this token recently and we just haven't
  // propagated it yet).
  try {
    const reply = await api.tabs.sendMessage(tabId, { type: "REQUEST_TOKEN_CHECK", tokenKey });
    if (reply && reply.token) {
      await storeToken(tokenKey, reply.token, "main-world-patch", reply.capturedAt || now, { url: "on-demand-check" });
      const refreshed = await api.storage.local.get(tokenKey);
      return refreshed[tokenKey];
    }
    logEvent("token-check", "On-demand check returned no token", { tokenKey, tabId });
  } catch (err) {
    logEvent("token-check", "REQUEST_TOKEN_CHECK failed", { tokenKey, error: err.message, tabId });
  }

  // Phase 2: proactive fetch — ask the MAIN-world script to scan the page's
  // sessionStorage/localStorage for cached JWT tokens matching this tokenKey.
  // Uses the same tab.sendMessage + token-relay.js postMessage mechanism
  // as REQUEST_TOKEN_CHECK, but now carries a PROACTIVE_FETCH_TOKEN type.
  try {
    const reply = await api.tabs.sendMessage(tabId, { type: "PROACTIVE_FETCH_TOKEN", tokenKey });
    if (reply && reply.token) {
      await storeToken(tokenKey, reply.token, "main-world-patch", reply.capturedAt || Date.now(), { url: "proactive-fetch" });
      const refreshed = await api.storage.local.get(tokenKey);
      return refreshed[tokenKey];
    }
    logEvent("token-check", "Proactive fetch returned no token", { tokenKey, error: reply?.error });
  } catch (err) {
    logEvent("token-check", "PROACTIVE_FETCH_TOKEN failed", { tokenKey, error: err.message, tabId });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Identity resolution — resolves rule.ruleConditions'
// umbrella.source.identity_ids numeric IDs into human-readable names.
//
// Confirmed live against org 8176184: Cisco's own dashboard batches every
// identity ID visible on the Access Policy page into ONE request per type
// below, and keeps whatever each endpoint actually matches — e.g.
// security_group_tag returned {total:0,data:[]} for a 5-ID batch that
// catalyst_sdwan matched 1 of the same 5 IDs on. This replicates that same
// "ask every known type, merge whatever comes back" strategy rather than
// trying to pre-classify an ID's type ourselves (which we can't do reliably
// from the rule condition alone).
//
// Real captured request shapes (not guessed):
//   security_group_tag / catalyst_sdwan:
//     GET https://management.api.umbrella.com/identity/v2/organizations/{orgId}/all_tag_identities/{type}?id=1,2,3
//     -> { total, limit, offset, data: [{ id, label, typeId, ... }] }
//     Both types share ONE token: mgmt_authz_token (issuer
//     "umbrella-authz/authsvc", scope "role:root-readonly", ~5min TTL).
//   internalnetworks:
//     GET https://api.opendns.com/v3/organizations/{orgId}/internalnetworks?filters={"label":"%%%"}&page=1&limit=500
//     -> [{ originId, label, ... }, ...]  (top-level array, NOT wrapped in
//     {data:...} like the other three)
//     Does NOT support filtering by id batch like the others — Cisco's own
//     frontend fetches up to 500 with a wildcard label filter and matches
//     originId client-side, so that's what this does too. Uses
//     opendns_token (aud "https://api.opendns.com/v3/", only ~60s TTL).
//   networkTunnelGroupsAndBranches (branch/tunnel identities, private-access
//   rules):
//     GET https://api.sse.cisco.com/deployments/v2/msa/networkTunnelGroupsAndBranches?offset=0&limit=100&filters={"ids":[1,2,3]}
//     -> { data: [{ id, name, type: "Branch"|"Network Tunnel Group", ... }] }
//     Reuses the existing sse_token — no new host/token needed for this one.
// ---------------------------------------------------------------------------

const IDENTITY_ENDPOINTS = [
  {
    name: "security_group_tag",
    tokenKey: "mgmt_authz_token",
    buildUrl: (orgId, ids) =>
      `https://management.api.umbrella.com/identity/v2/organizations/${orgId}/all_tag_identities/security_group_tag?id=${ids.join(",")}`,
    parse: (json) => (Array.isArray(json && json.data) ? json.data : []).map((e) => ({ id: e.id, name: e.label })),
  },
  {
    name: "catalyst_sdwan",
    tokenKey: "mgmt_authz_token",
    buildUrl: (orgId, ids) =>
      `https://management.api.umbrella.com/identity/v2/organizations/${orgId}/all_tag_identities/catalyst_sdwan?id=${ids.join(",")}`,
    parse: (json) => (Array.isArray(json && json.data) ? json.data : []).map((e) => ({ id: e.id, name: e.label })),
  },
  {
    name: "internalnetworks",
    tokenKey: "opendns_token",
    buildUrl: (orgId) =>
      `https://api.opendns.com/v3/organizations/${orgId}/internalnetworks?filters=${encodeURIComponent(
        JSON.stringify({ label: "%%%" })
      )}&page=1&limit=500`,
    parse: (json, ids) => {
      const idSet = new Set(ids.map(String));
      return (Array.isArray(json) ? json : [])
        .filter((e) => idSet.has(String(e.originId)))
        .map((e) => ({ id: e.originId, name: e.label }));
    },
  },
  {
    name: "networkTunnelGroupsAndBranches",
    tokenKey: "sse_token",
    buildUrl: (orgId, ids) =>
      `https://api.sse.cisco.com/deployments/v2/msa/networkTunnelGroupsAndBranches?offset=0&limit=100&filters=${encodeURIComponent(
        JSON.stringify({ ids })
      )}`,
    parse: (json) => (Array.isArray(json && json.data) ? json.data : []).map((e) => ({ id: e.id, name: e.name })),
  },
  {
    name: "active_directory",
    tokenKey: "mgmt_authz_token",
    buildUrl: (orgId, ids) =>
      `https://management.api.umbrella.com/identity/v2/organizations/${orgId}/all_tag_identities/active_directory?id=${ids.join(",")}`,
    parse: (json) => (Array.isArray(json && json.data) ? json.data : []).map((e) => ({ id: e.id, name: e.label })),
  },
  {
    name: "saml",
    tokenKey: "mgmt_authz_token",
    buildUrl: (orgId, ids) =>
      `https://management.api.umbrella.com/identity/v2/organizations/${orgId}/all_tag_identities/saml?id=${ids.join(",")}`,
    parse: (json) => (Array.isArray(json && json.data) ? json.data : []).map((e) => ({ id: e.id, name: e.label })),
  },
  {
    name: "azure_ad",
    tokenKey: "mgmt_authz_token",
    buildUrl: (orgId, ids) =>
      `https://management.api.umbrella.com/identity/v2/organizations/${orgId}/all_tag_identities/azure_ad?id=${ids.join(",")}`,
    parse: (json) => (Array.isArray(json && json.data) ? json.data : []).map((e) => ({ id: e.id, name: e.label })),
  },
  {
    name: "identity_search",
    tokenKey: "mgmt_authz_token",
    // CONFIRMED via CDP intercept: dashboard uses ?id= with specific IDs.
    // Handles arrays, { data: [...] }, { items: [...] }, and direct ID-keyed maps.
    buildUrl: (orgId, ids) =>
      `https://management.api.umbrella.com/identity/v2/organizations/${orgId}/search?id=${ids.join(",")}`,
    parse: (json, ids) => {
      if (!json) return [];
      // Helper: extract id and name from a single entry, checking all known field names
      const extract = (e) => {
        if (!e || typeof e !== "object") return null;
        // ID fields: originId is the primary key in /search responses, id is secondary
        const id = e.originId !== undefined ? e.originId : (e.id !== undefined ? e.id : null);
        // Name fields: label is primary, name/friendlyName are fallbacks
        const name = e.label || e.name || e.friendlyName || e.displayName || null;
        if (id !== null && id !== undefined && name) return { id: String(id), name };
        return null;
      };
      if (Array.isArray(json)) {
        return json.map(extract).filter(Boolean);
      }
      if (Array.isArray(json.data)) {
        return json.data.map(extract).filter(Boolean);
      }
      if (Array.isArray(json.items)) {
        return json.items.map(extract).filter(Boolean);
      }
      if (typeof json === "object") {
        const entries = [];
        for (const [key, val] of Object.entries(json)) {
          if (val && typeof val === "object") {
            const name = val.label || val.name || val.friendlyName || val.displayName;
            if (name) entries.push({ id: key, name });
          } else if (typeof val === "string") {
            entries.push({ id: key, name: val });
          }
        }
        return entries;
      }
      return [];
    },
  },
];

function collectIdentityIds(rules) {
  const ids = new Set();
  for (const rule of rules || []) {
    const conds = rule.ruleConditions || rule.conditions || [];
    if (!Array.isArray(conds)) continue;
    for (const c of conds) {
      if (c.attributeName !== "umbrella.source.identity_ids") continue;
      const values = c.attributeValue;
      if (Array.isArray(values)) {
        values.forEach((v) => ids.add(v));
      } else if (values !== undefined && values !== null) {
        ids.add(values);
      }
    }
  }
  return Array.from(ids);
}

// Resolves identity IDs into an { [id]: name } map. Best-effort per
// endpoint: if a given endpoint's token isn't available yet (e.g. the user
// hasn't been on the dashboard long enough for that specific short-lived
// token to be captured), that endpoint is skipped rather than failing the
// whole scan — unresolved IDs fall back to "[unknown identity <id>]" in the
// UI, same pattern already used for destination_list_ids/appRiskProfileId.
async function resolveIdentities(rules, orgId, tabId) {
  const ids = collectIdentityIds(rules);
  if (ids.length === 0) return {};

  const map = {};
  await Promise.all(
    IDENTITY_ENDPOINTS.map(async (endpoint) => {
      try {
        const tokenObj = await getFreshToken(endpoint.tokenKey, tabId);
        if (!tokenObj) {
          logEvent("identity-resolve", "Skipped endpoint — no fresh token", {
            endpoint: endpoint.name, tokenKey: endpoint.tokenKey,
          });
          return;
        }
        const url = endpoint.buildUrl(orgId, ids);
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${tokenObj.token}`,
            Accept: "application/json",
            Origin: "https://dashboard.sse.cisco.com",
            Referer: "https://dashboard.sse.cisco.com/",
          },
        });
        if (!response.ok) {
          logEvent("identity-resolve", "Endpoint returned non-OK status", {
            endpoint: endpoint.name, status: response.status,
          });
          return;
        }
        const text = await response.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch (_) {
          logEvent("identity-resolve", "Endpoint non-JSON response", { endpoint: endpoint.name });
          return;
        }
        const entries = endpoint.parse(json, ids);
        for (const e of entries) {
          if (e && e.id !== undefined && e.name) map[String(e.id)] = e.name;
        }
        logEvent("identity-resolve", "Endpoint resolved", { endpoint: endpoint.name, matched: entries.length });
      } catch (err) {
        logEvent("identity-resolve", "Endpoint fetch failed", { endpoint: endpoint.name, error: err.message });
      }
    })
  );

  return map;
}

// Resolves identity types (typeId → type name) using the /search?id= endpoint.
// CONFIRMED via CDP intercept + direct test: /search?id=... returns entries
// with both typeId and type fields. The /containers endpoint only returns
// container-level types (3,5,7) but rules reference many more typeIds (34,36,38,50,57,etc).
async function resolveIdentityTypes(orgId, tabId, rules) {
  const typeMap = {};
  
  try {
    const tokenObj = await getFreshToken("mgmt_authz_token", tabId);
    if (!tokenObj) {
      logEvent("identity-type-resolve", "No mgmt_authz_token available");
      return typeMap;
    }
    
    // Always call /containers to get the full typeId → label mapping.
    // This is the same endpoint the dashboard uses. CONFIRMED via CDP
    // intercept: dashboard GETs /containers with 200 and extracts all type
    // info. The /search?id= approach only returns types of SPECIFIC identity
    // IDs searched, missing typeIds referenced directly in rule conditions
    // (e.g. umbrella.source.identity_type_ids = [34,36,38,50,57]).
    //
    // CRITICAL: The /containers endpoint returns 403 without Origin/Referer
    // headers. Adding these (dashboard origin) makes it work from the SW
    // context — confirmed by live test returning 16 type entries.
    const containersUrl = `https://management.api.umbrella.com/identity/v2/organizations/${orgId}/containers?offset=0&limit=100`;
    const resp = await fetch(containersUrl, {
      headers: {
        Authorization: `Bearer ${tokenObj.token}`,
        Accept: "application/json",
        Origin: "https://dashboard.sse.cisco.com",
        Referer: "https://dashboard.sse.cisco.com/",
      },
    });
    if (resp.ok) {
      const json = await resp.json();
      for (const entry of (json.data || [])) {
        if (entry.typeId !== undefined && entry.label) {
          typeMap[entry.typeId] = entry.label;
        }
      }
    } else {
      logEvent("identity-type-resolve", "Containers returned non-OK", { status: resp.status });
      // Fallback: try /search?id= for partial coverage from identity IDs
      const ids = collectIdentityIds(rules);
      if (ids.length > 0) {
        const url = `https://management.api.umbrella.com/identity/v2/organizations/${orgId}/search?id=${ids.join(",")}`;
        const searchResp = await fetch(url, {
          headers: { Authorization: `Bearer ${tokenObj.token}`, Accept: "application/json" },
        });
        if (searchResp.ok) {
          const searchJson = await searchResp.json();
          for (const entry of (searchJson.data || [])) {
            if (entry.typeId !== undefined && entry.type) {
              typeMap[entry.typeId] = entry.type;
            }
          }
        }
      }
    }
    
    logEvent("identity-type-resolve", "Resolved identity types from /containers", { count: Object.keys(typeMap).length });
  } catch (err) {
    logEvent("identity-type-resolve", "Failed to resolve identity types", { error: err.message });
  }
  
  // --- Hardcoded fallback for Cisco-known identity types not in /containers ---
  // The /containers endpoint only returns types for identities the org actually
  // has, but rules can reference typeIds that are Cisco-defined platform types
  // not present in any org. These are documented in Cisco Secure Access and
  // confirmed by the dashboard panel labels.
  const HARDCODED_TYPE_NAMES = {
    34: "Posture",
    50: "Endpoint Requirements",
    // Common Cisco identity type IDs — add more as discovered
    12: "IP Range",
    15: "Secure Client",
    16: "AnyConnect",
  };
  
  // Collect all typeIds referenced by rules
  const referencedTypeIds = new Set();
  for (const rule of rules) {
    const conds = rule.ruleConditions || rule.conditions || [];
    for (const cond of conds) {
      // Format 1: direct arrays (e.g. identityTypeIds / identity_type_ids)
      if (cond.identityTypeIds) {
        for (const id of cond.identityTypeIds) referencedTypeIds.add(id);
      }
      if (cond.identity_type_ids) {
        for (const id of cond.identity_type_ids) referencedTypeIds.add(id);
      }
      // Format 2: rule condition objects with attributeName/attributeValue
      if (cond.attributeName === "umbrella.source.identity_type_ids" &&
          Array.isArray(cond.attributeValue)) {
        for (const id of cond.attributeValue) referencedTypeIds.add(id);
      }
    }
  }
  
  // Fill in missing types from hardcoded map
  let fallbackCount = 0;
  for (const tid of referencedTypeIds) {
    if (!typeMap[tid] && HARDCODED_TYPE_NAMES[tid]) {
      typeMap[tid] = HARDCODED_TYPE_NAMES[tid];
      fallbackCount++;
    }
  }
  if (fallbackCount > 0) {
    logEvent("identity-type-resolve", `Applied ${fallbackCount} hardcoded fallback type name(s)`);
  }
  
  return typeMap;
}

// ---------------------------------------------------------------------------
// Destination-object resolution — private_resource_ids /
// private_resource_group_ids (Private Access rule destinations). Kept as a
// SEPARATE map from identityMap, not merged into it — both are just numeric
// IDs from unrelated ID spaces (an identity ID and a private-resource-group
// ID could easily collide on the same number), so merging them into one
// flat { id: name } map risks one silently overwriting the other.
//
// Real captured request/response shapes (org 8176184, not guessed):
//   GET https://api.umbrella.com/v1/organizations/{orgId}/private_resources?offset=0&limit=1000&sortBy=name&sortOrder=asc
//     -> { items: [{ resourceId, name, friendlyName, ... }], offset, limit, total }
//   GET https://api.umbrella.com/v1/organizations/{orgId}/private_resource_groups?offset=0&limit=1000&sortBy=name&sortOrder=asc
//     -> { items: [{ resourceGroupId, name, description, resourceIds, ... }], offset, limit, total }
// Both reuse the existing sse_token (same host as fetchRules) — no new
// token/audience needed, unlike the identity endpoints.
//
// Unlike the identity endpoints (which need a targeted ID batch query),
// these support no id-filter that's confirmed reliable, and the org-wide
// list is small (14 resources / 3 groups on org 8176184) — so this always
// fetches the FULL unfiltered list rather than pre-collecting which IDs are
// actually referenced. Simpler, and covers every rule's references at once
// regardless of which specific rule triggered the scan.
//
// networkObjectIds / serviceObjectGroupIds are classified as destination-
// dimension too (see matcher.js's conditionDimension()) but are NOT
// resolved here yet — their real endpoint response shapes haven't been
// confirmed live. They still fall back to summarizeConditions()'s generic
// humanized-fallback text with the raw ID visible, same as before.
// ---------------------------------------------------------------------------

const OBJECT_ENDPOINTS = [
  {
    name: "private_resources",
    tokenKey: "sse_token",
    buildUrl: (orgId) =>
      `https://api.umbrella.com/v1/organizations/${orgId}/private_resources?offset=0&limit=1000&sortBy=name&sortOrder=asc`,
    parse: (json) =>
      (Array.isArray(json && json.items) ? json.items : []).map((e) => ({
        id: e.resourceId,
        name: e.name || e.friendlyName,
      })),
  },
  {
    name: "private_resource_groups",
    tokenKey: "sse_token",
    buildUrl: (orgId) =>
      `https://api.umbrella.com/v1/organizations/${orgId}/private_resource_groups?offset=0&limit=1000&sortBy=name&sortOrder=asc`,
    parse: (json) =>
      (Array.isArray(json && json.items) ? json.items : []).map((e) => ({
        id: e.resourceGroupId,
        name: e.name,
      })),
  },
  {
    name: "destination_lists",
    tokenKey: "opendns_token",
    // CONFIRMED via CDP: dashboard uses ?ids=[...] with specific IDs
    buildUrl: (orgId, ids) => {
      if (ids && ids.length > 0) {
        return `https://api.opendns.com/v3/organizations/${orgId}/destinationlists?ids=[${ids.join(",")}]&optionalFields={meta:'meta'}&getAll=true`;
      }
      return `https://api.opendns.com/v3/organizations/${orgId}/destinationlists?limit=1000&getAll=true`;
    },
    parse: (json) => {
      const items = Array.isArray(json) ? json : (json?.items || json?.data || []);
      return items.map((e) => ({ id: e.id, name: e.name }));
    },
  },
  {
    name: "network_objects",
    tokenKey: "sse_token",
    // CONFIRMED via CDP: endpoint returns 400 without ?ids=
    buildUrl: (orgId, ids) => {
      if (ids && ids.length > 0) {
        return `https://api.sse.cisco.com/policies/v2/objects/networkObjects?ids=${ids.join(",")}`;
      }
      return `https://api.sse.cisco.com/policies/v2/objects/networkObjects?offset=0&limit=100`;
    },
    parse: (json) => {
      const items = Array.isArray(json) ? json : (json?.results || json?.data || []);
      return items.map((e) => ({ id: e.id, name: e.name }));
    },
  },
  {
    name: "network_object_groups",
    tokenKey: "sse_token",
    // CONFIRMED via CDP: dashboard queries networkObjectGroups
    buildUrl: (orgId, ids) => {
      if (ids && ids.length > 0) {
        return `https://api.sse.cisco.com/policies/v2/objects/networkObjectGroups?ids=${ids.join(",")}`;
      }
      return `https://api.sse.cisco.com/policies/v2/objects/networkObjectGroups?offset=0&limit=100`;
    },
    parse: (json) => {
      const items = Array.isArray(json) ? json : (json?.results || json?.data || []);
      return items.map((e) => ({ id: e.id, name: e.name }));
    },
  },
  {
    name: "service_objects",
    tokenKey: "sse_token",
    // CONFIRMED via CDP: dashboard queries serviceObjects
    buildUrl: (orgId, ids) => {
      if (ids && ids.length > 0) {
        return `https://api.sse.cisco.com/policies/v2/objects/serviceObjects?ids=${ids.join(",")}`;
      }
      return `https://api.sse.cisco.com/policies/v2/objects/serviceObjects?offset=0&limit=100`;
    },
    parse: (json) => {
      const items = Array.isArray(json) ? json : (json?.results || json?.data || []);
      return items.map((e) => ({ id: e.id, name: e.name }));
    },
  },
  {
    name: "service_object_groups",
    tokenKey: "sse_token",
    // CONFIRMED via CDP: endpoint returns 400 without ?ids=
    buildUrl: (orgId, ids) => {
      if (ids && ids.length > 0) {
        return `https://api.sse.cisco.com/policies/v2/objects/serviceObjectGroups?ids=${ids.join(",")}`;
      }
      return `https://api.sse.cisco.com/policies/v2/objects/serviceObjectGroups?offset=0&limit=100`;
    },
    parse: (json) => {
      const items = Array.isArray(json) ? json : (json?.results || json?.data || []);
      return items.map((e) => ({ id: e.id, name: e.name }));
    },
  },
  {
    name: "application_lists",
    tokenKey: "sse_token",
    buildUrl: (orgId) =>
      `https://api.umbrella.com/v1/organizations/${orgId}/application_lists`,
    parse: (json) => {
      // CONFIRMED: response is { applicationLists: [...] } with
      // applicationListId / applicationListName, NOT { items: [...] }
      const items = json?.applicationLists || json?.items || json?.data || [];
      return items.map((e) => ({
        id: e.applicationListId || e.id,
        name: e.applicationListName || e.name,
      }));
    },
  },
  {
    name: "category_lists",
    tokenKey: "opendns_token",
    // CONFIRMED via CDP intercept: dashboard uses /categorysettings, NOT
    // /categorylists (which returns 405). Response wraps data in { status, data }.
    buildUrl: (orgId) =>
      `https://api.opendns.com/v3/organizations/${orgId}/categorysettings?sort=%7B%20%22name%22%3A%20%22asc%22%2C%20%22createdAt%22%3A%20%22desc%22%20%7D&outputFormat=jsonHttpStatusOverride&filters=%7B%7D`,
    parse: (json) => {
      // Response shape: { status: {...}, data: [...] } or array or { items: [...] }
      const raw = json?.data || (Array.isArray(json) ? json : json?.items || []);
      const items = Array.isArray(raw) ? raw : [];
      return items.map((e) => ({
        id: e.categorySettingId || e.id,
        name: e.categorySettingName || e.name,
      }));
    },
  },
  {
    name: "app_risk_profiles",
    tokenKey: "mgmt_authz_token",
    // DISCOVERED via CDP network interception of dashboard: the dashboard SPA
    // calls this internal endpoint to resolve App Risk Profile UUIDs to names.
    // Response is base64-encoded JSON: {"items":[{"app_risk_profile_id":"uuid",
    // "app_risk_profile_name":"name",...}]}. Requires mgmt_authz_token.
    buildUrl: () =>
      "https://management.api.umbrella.com/policies.us/v2/appRiskProfileManager/appRiskProfiles",
    parse: (json) => {
      // Response may be base64-encoded; the items array has UUID-keyed profiles
      let data = json;
      if (typeof json === "string") {
        try { data = JSON.parse(atob(json)); } catch (e) { data = json; }
      }
      const items = data?.items || [];
      return items.map((e) => ({
        id: e.app_risk_profile_id || e.id,
        name: e.app_risk_profile_name || e.name,
      }));
    },
  },
  {
    name: "posture_profiles",
    tokenKey: "sse_token",
    buildUrl: (orgId) =>
      `https://api.umbrella.com/v1/organizations/${orgId}/postureprofiles`,
    parse: (json) => {
      const items = Array.isArray(json) ? json : (json?.items || json?.data || []);
      return items.map((e) => ({
        id: e.postureProfileId || e.id,
        name: e.postureProfileName || e.name,
      }));
    },
  },
];
// Collect all object IDs referenced in rule conditions, grouped by type.
// These are needed by endpoints that require ?ids= parameters (networkObjects,
// serviceObjectGroups, etc.)
function collectObjectIds(rules) {
  const result = {
    networkObjects: new Set(),
    networkObjectGroups: new Set(),
    serviceObjects: new Set(),
    serviceObjectGroups: new Set(),
    destinationLists: new Set(),
    applicationLists: new Set(),
    categoryLists: new Set(),
  };
  
  for (const rule of rules || []) {
    const conds = rule.conditions || rule.ruleConditions || [];
    if (!Array.isArray(conds)) continue;
    for (const c of conds) {
      const name = (c.attributeName || "").toLowerCase();
      const values = Array.isArray(c.attributeValue) ? c.attributeValue : [c.attributeValue];
      // Match both snake_case and camelCase attribute names
      if ((name.includes("network_object") || name.includes("networkobject")) && !name.includes("group")) {
        values.forEach(v => { if (v && v !== "*" && String(v) !== "any") result.networkObjects.add(String(v)); });
      }
      if (name.includes("network_object_group") || name.includes("networkobjectgroup")) {
        values.forEach(v => { if (v && v !== "*" && String(v) !== "any") result.networkObjectGroups.add(String(v)); });
      }
      if ((name.includes("service_object") || name.includes("serviceobject")) && !name.includes("group")) {
        values.forEach(v => { if (v && v !== "*" && String(v) !== "any") result.serviceObjects.add(String(v)); });
      }
      if (name.includes("service_object_group") || name.includes("serviceobjectgroup")) {
        values.forEach(v => { if (v && v !== "*" && String(v) !== "any") result.serviceObjectGroups.add(String(v)); });
      }
      if (name.includes("destination_list")) {
        values.forEach(v => { if (v && v !== "*" && String(v) !== "any") result.destinationLists.add(String(v)); });
      }
      if (name.includes("application_list")) {
        values.forEach(v => { if (v && v !== "*" && String(v) !== "any") result.applicationLists.add(String(v)); });
      }
      if (name.includes("category_list")) {
        values.forEach(v => { if (v && v !== "*" && String(v) !== "any") result.categoryLists.add(String(v)); });
      }
    }
  }
  
  // Convert Sets to Arrays
  for (const key of Object.keys(result)) {
    result[key] = Array.from(result[key]);
  }
  return result;
}

// Resolves all destination object references into separate maps by type.
// Returns { privateResources, destinationLists, networkObjects, serviceObjectGroups, applicationLists, categoryLists }
// Each map is { [id]: name }. Best-effort per endpoint — a skipped/failed
// endpoint just leaves those IDs unresolved ("[unknown ...]" in the UI)
// rather than sinking the whole scan.
async function resolveObjectRefs(orgId, tabId, rules) {
  // Collect IDs referenced in rules so endpoints that require ?ids= get them
  const refIds = collectObjectIds(rules);
  
  const maps = {
    privateResources: {},
    destinationLists: {},
    networkObjects: {},
    networkObjectGroups: {},
    serviceObjects: {},
    serviceObjectGroups: {},
    applicationLists: {},
    categoryLists: {},
    appRiskProfiles: {},
    postureProfiles: {},
  };
  
  await Promise.all(
    OBJECT_ENDPOINTS.map(async (endpoint) => {
      try {
        const tokenObj = await getFreshToken(endpoint.tokenKey, tabId);
        if (!tokenObj) {
          logEvent("object-resolve", "Skipped endpoint — no fresh token", {
            endpoint: endpoint.name, tokenKey: endpoint.tokenKey,
          });
          return;
        }
        // Pass collected IDs to buildUrl (endpoints that need ?ids= will use them)
        // Map endpoint names to the refIds keys from collectObjectIds
        const idKeyMap = {
          "destination_lists": "destinationLists",
          "network_objects": "networkObjects",
          "network_object_groups": "networkObjectGroups",
          "service_objects": "serviceObjects",
          "service_object_groups": "serviceObjectGroups",
          "application_lists": "applicationLists",
          "category_lists": "categoryLists",
        };
        const ids = refIds[idKeyMap[endpoint.name]] || [];
        const url = endpoint.buildUrl(orgId, ids);
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${tokenObj.token}`, Accept: "application/json" },
        });
        if (!response.ok) {
          logEvent("object-resolve", "Endpoint returned non-OK status", {
            endpoint: endpoint.name, status: response.status,
          });
          return;
        }
        const json = await response.json();
        const entries = endpoint.parse(json);
        
        // Populate the appropriate map based on endpoint name
        const mapKey =
          endpoint.name === "private_resources" ? "privateResources" :
          endpoint.name === "private_resource_groups" ? "privateResources" :
          endpoint.name === "destination_lists" ? "destinationLists" :
          endpoint.name === "network_objects" ? "networkObjects" :
          endpoint.name === "network_object_groups" ? "networkObjectGroups" :
          endpoint.name === "service_objects" ? "serviceObjects" :
          endpoint.name === "service_object_groups" ? "serviceObjectGroups" :
          endpoint.name === "application_lists" ? "applicationLists" :
          endpoint.name === "category_lists" ? "categoryLists" :
          endpoint.name === "app_risk_profiles" ? "appRiskProfiles" :
          endpoint.name === "posture_profiles" ? "postureProfiles" :
          null;
        
        if (mapKey && maps[mapKey]) {
          for (const e of entries) {
            if (e && e.id !== undefined && e.name) {
              maps[mapKey][String(e.id)] = e.name;
            }
          }
        }
        
        logEvent("object-resolve", "Endpoint resolved", { endpoint: endpoint.name, count: entries.length });
      } catch (err) {
        logEvent("object-resolve", "Endpoint fetch failed", { endpoint: endpoint.name, error: err.message });
      }
    })
  );

  return maps;
}

// ---------------------------------------------------------------------------
// Message listener — simplified for fetch-on-token-capture architecture.
//
// TOKEN_CAPTURED: store the token (which triggers _scheduleFetch → fetchAllData)
// RUN_SCAN:       manual refresh — just calls fetchAllData() directly
// GET_*:          read from storage.local (used by content-script.js hover popovers)
// ---------------------------------------------------------------------------

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TOKEN_CAPTURED") {
    storeToken(
      msg.tokenKey || "sse_token",
      msg.token,
      msg.source || "main-world-patch",
      msg.capturedAt || Date.now(),
      { url: sender?.tab?.url }
    );
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "RUN_SCAN") {
    // Manual refresh — data is already being auto-fetched on token capture,
    // but this lets the popup request an immediate refetch (e.g. Refresh button).
    logEvent("run-scan", "RUN_SCAN invoked (manual refresh)", { orgId: msg.orgId });
    fetchAllData(msg.orgId || undefined).then(() => {
      sendResponse({ ok: true });
    }).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (msg.type === "GET_FINDINGS") {
    api.storage.local.get("sse_findings").then(result => {
      sendResponse({ findings: result.sse_findings || [] });
    });
    return true;
  }

  if (msg.type === "GET_RULES") {
    api.storage.local.get("sse_rules").then(result => {
      sendResponse({ rules: result.sse_rules || [] });
    });
    return true;
  }

  if (msg.type === "GET_IDENTITY_MAP") {
    api.storage.local.get("sse_identity_map").then(result => {
      sendResponse({ identityMap: result.sse_identity_map || {} });
    });
    return true;
  }

  if (msg.type === "GET_OBJECT_MAP") {
    api.storage.local.get("sse_object_maps").then(result => {
      const objectMaps = result.sse_object_maps || {};
      const objectMap = {};
      for (const map of Object.values(objectMaps)) {
        Object.assign(objectMap, map);
      }
      sendResponse({ objectMap, objectMaps });
    });
    return true;
  }

  if (msg.type === "GET_IDENTITY_TYPE_MAP") {
    api.storage.local.get("sse_identity_type_map").then(result => {
      sendResponse({ identityTypeMap: result.sse_identity_type_map || {} });
    });
    return true;
  }
});

// ---------------------------------------------------------------------------
// Periodic refresh alarm — refetches all data every REFRESH_INTERVAL_MIN
// minutes to keep it fresh. Scheduled by fetchAllData() after each success.
// ---------------------------------------------------------------------------

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    logEvent("alarm", "Periodic refresh triggered");
    fetchAllData().catch(err => {
      logEvent("alarm", "fetchAllData failed", { error: err.message });
    });
  }
});

// Also schedule a refresh on SW startup in case the alarm was lost
// (alarms don't survive browser restart in MV3).
api.runtime.onInstalled.addListener(() => {
  api.alarms.get(REFRESH_ALARM).then(alarm => {
    if (!alarm) {
      api.storage.local.get(["sse_token", "mgmt_authz_token", "opendns_token"]).then(data => {
        if (data.sse_token || data.mgmt_authz_token || data.opendns_token) {
          logEvent("sw-startup", "Found tokens on startup — scheduling refresh + fetch");
          api.alarms.create(REFRESH_ALARM, { delayInMinutes: REFRESH_INTERVAL_MIN });
          _scheduleFetch();
        }
      });
    }
  });
});
