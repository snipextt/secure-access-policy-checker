// =============================================================================
// popup.js — main controller for the extension popup
//
// Architecture: data is auto-fetched by the service worker the moment a token
// is captured (fetch-on-token-capture). The popup just reads pre-fetched data
// from chrome.storage.local and listens for live updates.
//
// Depends on (loaded via <script> tags in popup.html, in this order):
//   1. matcher.js        → window.Matcher
//   2. popup-sections.js → window.PopupSections
//   3. this file
// =============================================================================

const api = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
  const errorBanner = document.getElementById("error-banner");
  const testerRoot = document.getElementById("tester-root");
  const rulesRoot = document.getElementById("rules-root");

  let catalogRefreshRequested = false;

  // ---------------------------------------------------------------------------
  // Header close button logic
  // ---------------------------------------------------------------------------
  const closeBtn = document.getElementById("toolbar-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      minimizeEmbeddedPanel();
    });
  }

  // ---------------------------------------------------------------------------
  // Tab Switching Logic
  // ---------------------------------------------------------------------------
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.getAttribute("data-target")).classList.add("active");
    });
  });

  // ---------------------------------------------------------------------------
  // State handles
  // ---------------------------------------------------------------------------
  let testerHandle = null;
  let auditHandle  = null;
  let currentRules       = [];
  let currentFindings    = [];
  let currentIdentityMap = {};
  let currentObjectMap   = {};
  let currentObjectMaps  = {
    privateResources: {},
    destinationLists: {},
    networkObjects: {},
    serviceObjectGroups: {},
    applicationLists: {},
    categoryLists: {},
    appRiskProfiles: {},
  };
  let currentIdentityTypeMap = {};
  let currentRuleFetchStatus = {};

  // ---------------------------------------------------------------------------
  // Highlight matched rule on the dashboard page
  // ---------------------------------------------------------------------------
  function highlightOnPage(ruleName, matchedConditions) {
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      api.tabs.sendMessage(tabs[0].id, { type: "HIGHLIGHT_RULE", ruleName, matchedConditions }, () => {
        if (api.runtime.lastError) {
          console.warn("[popup] HIGHLIGHT_RULE — content script not reachable:",
            api.runtime.lastError.message);
        }
      });
    });
  }

  function buildNoMatchDiagnostic(rules, testInput, ruleFetchStatus) {
    const scopeText = String(testInput.destinationScope || "").trim().toLowerCase();
    const normalizedScope =
      scopeText === "internet" || scopeText === "public internet" || scopeText === "public_internet"
        ? "public_internet"
        : scopeText === "private access" || scopeText === "private_network"
          ? "private_network"
          : null;
    const defaults = (rules || []).filter(rule => rule.is_default || rule.ruleIsDefault).map(rule => ({
      id: rule.id || rule.ruleId,
      name: rule.name || rule.ruleName,
      scope: rule.trafficScope || rule.ruleAccess || (rule.raw && rule.raw.ruleAccess) || null,
      action: rule.action || rule.ruleAction,
      conditions: (rule.conditions || rule.ruleConditions || []).map(condition => condition.attributeName),
    }));
    return {
      destination: testInput.destination || "",
      scope: testInput.destinationScope || "",
      normalizedScope,
      defaults,
      defaultRuleFetch: (ruleFetchStatus && ruleFetchStatus.defaultRuleFetch) || null,
    };
  }

  function renderResults(rules, findings, identityMap, objectMap, objectMaps, identityTypeMap) {
    testerRoot.innerHTML = "";
    rulesRoot.innerHTML = "";
    testerHandle = null;
    auditHandle  = null;

    const identityOptions = window.Matcher.getIdentityOptions(rules);

    // 1. Tab 1: Policy Tester panel
    testerHandle = window.PopupSections.buildTesterPanel(
      testerRoot,
      identityOptions,
      objectMaps || { privateResources: objectMap || {} },
      identityTypeMap || {},
      identityMap || {},
      /* onRun */ async (testInput) => {
        const lookups = await window.PopupSections.loadLookups();
        Object.assign(lookups, currentObjectMaps || {});
        lookups.identities = currentIdentityMap;
        lookups.objects = currentObjectMap;
        lookups.privateResources = (currentObjectMaps && currentObjectMaps.privateResources) || currentObjectMap || {};
        lookups.destinationLists = (currentObjectMaps && currentObjectMaps.destinationLists) || {};
        lookups.networkObjects   = (currentObjectMaps && currentObjectMaps.networkObjects) || {};
        lookups.serviceObjectGroups = (currentObjectMaps && currentObjectMaps.serviceObjectGroups) || {};
        lookups.applicationLists = (currentObjectMaps && currentObjectMaps.applicationLists) || {};
        lookups.categoryLists    = (currentObjectMaps && currentObjectMaps.categoryLists) || {};
        lookups.appRiskProfiles  = (currentObjectMaps && currentObjectMaps.appRiskProfiles) || {};
        const result = window.Matcher.matchPolicy(currentRules, testInput, lookups);
        if (testerHandle) {
          testerHandle.updateResult(result === null ? {
            noMatch: true,
            diagnostic: buildNoMatchDiagnostic(currentRules, testInput, currentRuleFetchStatus),
          } : result);
        }
        if (result) {
          const displayName = result.rule.ruleName || result.rule.name || "(unnamed)";
          highlightOnPage(displayName, result.matchedConditions);
          minimizeEmbeddedPanel();
        }
      },
      /* onReset */ () => {
        if (testerHandle) testerHandle.updateResult(null);
      }
    );

    // 2. Tab 2: Single Rules List
    auditHandle = window.PopupSections.buildRulesList(rulesRoot);
    auditHandle.update(rules, findings, identityMap || {}, objectMap || {}, objectMaps || {}, identityTypeMap || {});
  }

  // ---------------------------------------------------------------------------
  // Org-ID handshake — needed when popup is embedded in content-script.js's
  // injected iframe (cross-origin can't read parent location directly).
  // ---------------------------------------------------------------------------
  const DASHBOARD_ORIGIN_PATTERN = /^https:\/\/([a-z0-9-]+\.)?cisco\.com$/i;

  function isEmbeddedInPage() {
    return window.self !== window.top;
  }

  function minimizeEmbeddedPanel() {
    if (!isEmbeddedInPage()) return;
    window.parent.postMessage({ type: "SEC_MINIMIZE_PANEL" }, "*");
  }

  function requestOrgIdFromParent(timeoutMs = 1500) {
    return new Promise((resolve) => {
      let done = false;
      function onMessage(event) {
        if (done) return;
        if (!DASHBOARD_ORIGIN_PATTERN.test(event.origin)) return;
        if (event.source !== window.parent) return;
        if (!event.data || event.data.type !== "SEC_ORG_CONTEXT") return;
        done = true;
        window.removeEventListener("message", onMessage);
        resolve(event.data.orgId || null);
      }
      window.addEventListener("message", onMessage);
      window.parent.postMessage({ type: "SEC_REQUEST_ORG_CONTEXT" }, "*");
      setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage);
        resolve(null);
      }, timeoutMs);
    });
  }

  // ---------------------------------------------------------------------------
  // "Analyzing" spinner — shown while waiting for pre-fetched data
  // ---------------------------------------------------------------------------
  function showAnalyzing(msg) {
    const text = msg || "Analyzing policies\u2026";
    rulesRoot.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  padding:40px 20px;color:#94a3b8;font-size:14px;gap:12px;">
        <div style="width:28px;height:28px;border:3px solid #334155;border-top-color:#60a5fa;
                    border-radius:50%;animation:psc-spin 0.8s linear infinite;"></div>
        <span>${text}</span>
      </div>
    `;
    // Inject keyframe if not already present
    if (!document.getElementById("psc-analyzing-style")) {
      const style = document.createElement("style");
      style.id = "psc-analyzing-style";
      style.textContent = "@keyframes psc-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(style);
    }
  }

  // ---------------------------------------------------------------------------
  // Load from chrome.storage.local and render
  // Returns "resolved" | "partial" | "empty"
  // ---------------------------------------------------------------------------
  async function loadAndRender() {
    const cached = await api.storage.local.get([
      "sse_rules", "sse_findings", "sse_identity_map", "sse_identity_type_map", "sse_object_maps", "sse_rule_fetch_status"
    ]);

    if (!cached.sse_rules || cached.sse_rules.length === 0) {
      // The catalog APIs do not depend on rules. Start them immediately so
      // selector fields can render a loading state and populate in place.
      triggerRefresh();
      return "empty";
    }

    currentRules = cached.sse_rules;
    currentFindings = cached.sse_findings || [];
    currentIdentityMap = cached.sse_identity_map || {};
    currentIdentityTypeMap = cached.sse_identity_type_map || {};
    currentRuleFetchStatus = cached.sse_rule_fetch_status || {};
    const om = cached.sse_object_maps || {};
    currentObjectMaps = om;
    currentObjectMap = om.privateResources || {};

    // A partial object map must not suppress catalog loading. Source and
    // destination selectors are ready only after their own catalog keys exist.
    const requiredCatalogs = [
      "sourceUsers", "sourceRoaming", "sourceGroups", "sourceEndpointDevices",
      "sourceNetworks", "sourceSites", "sourceSecurityGroupTags", "sourceCatalystSdwan",
      "sourceTunnelGroups", "sourceNetworkDevices", "sourceMobileDevices", "sourceChromebooks", "sourceZtnaClients",
      "destinationScopes",
    ];
    // Render immediately with available maps. Individual selectors convey
    // loading/unavailable/empty state, so one failed catalog must not hold the
    // entire Rules tab in a permanent "Resolving labels" loop.
    const missingCatalogs = requiredCatalogs.filter(key => !Object.prototype.hasOwnProperty.call(om, key));
    errorBanner.style.display = "none";
    renderResults(currentRules, currentFindings, currentIdentityMap, currentObjectMap, currentObjectMaps, currentIdentityTypeMap);

    if (missingCatalogs.length === 0) {
      return "resolved";
    }

    // Only ask once per popup instance. Storage writes from a refresh used to
    // re-enter loadAndRender() and start another refresh indefinitely.
    if (!catalogRefreshRequested) {
      catalogRefreshRequested = true;
      triggerRefresh();
    }

    const resolvingBar = document.createElement("div");
    resolvingBar.id = "psc-resolving-bar";
    resolvingBar.style.cssText = "background:#1e293b;color:#60a5fa;padding:8px 16px;font-size:12px;" +
      "text-align:center;border-bottom:1px solid #334155;";
    resolvingBar.textContent = `⏳ Loading ${missingCatalogs.length} catalog${missingCatalogs.length === 1 ? "" : "s"}… unavailable catalogs remain usable as unavailable fields.`;
    rulesRoot.prepend(resolvingBar);
    return "partial";
  }

  // ---------------------------------------------------------------------------
  // Manual refresh — ask SW to re-fetch everything now
  // ---------------------------------------------------------------------------
  async function triggerRefresh() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let orgId = urlParams.get("orgId");
      if (!orgId && isEmbeddedInPage()) {
        orgId = await requestOrgIdFromParent();
      }
      api.runtime.sendMessage({ type: "RUN_SCAN", orgId });
    } catch (e) {
      // SW may be asleep — message will wake it, just ignore errors
    }
  }

  // ---------------------------------------------------------------------------
  // Entry point — render results immediately and listen for live updates
  // ---------------------------------------------------------------------------

  loadAndRender().then((status) => {
    if (status === "empty") {
      // Ensure the tester form is always built and interactive
      renderResults([], [], currentIdentityMap, currentObjectMap, currentObjectMaps, currentIdentityTypeMap);
    }
  });

  // Live update: when SW writes new data to storage, re-render
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.sse_rules || changes.sse_identity_map || changes.sse_object_maps || changes.sse_identity_type_map || changes.sse_rule_fetch_status) {
      loadAndRender();
    }
  });
});
