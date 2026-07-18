const api = typeof browser !== 'undefined' ? browser : chrome;

// ---------------------------------------------------------------------------
// injectBadge — appends a severity badge span to a rule row element
// ---------------------------------------------------------------------------

function injectBadge(element, finding) {
  const span = document.createElement("span");
  span.className = `sec-badge sec-badge-${finding.severity}`;
  span.textContent = finding.severity.toUpperCase();
  span.title = finding.message;
  element.appendChild(span);
  element.dataset.secChecked = "true";
}

// ---------------------------------------------------------------------------
// findRuleRows — matches the real Cisco Secure Access dashboard DOM.
//
// The dashboard is built on the Cisco Design System (CDS), which emits
// CSS-in-JS classes with a build/session-specific hash suffix appended to a
// stable base class, e.g. "cds-table__row_72958d5c77d62d67c0dac2ad1d50efd7
// cds-table__row cds-table__row--draggable" — both classes are present on
// the same element, space-separated.
//
// IMPORTANT: selectors here must only ever reference the stable, unhashed
// base class (e.g. ".cds-table__row"), never the hashed variant — the hash
// changes on every Cisco redeploy and would silently break matching. This is
// the standing rule for any future DOM-scraping code added to this file: if
// you're tempted to copy a class string straight from devtools, strip the
// hash suffix first.
//
// These selectors WILL break again if Cisco changes the CDS component
// structure (e.g. renames "cds-table__row" or restructures the table). If
// findRuleRows() starts returning [] again, re-inspect the live dashboard
// DOM and update the selectors below.
// ---------------------------------------------------------------------------

function findRuleRows() {
  const selectors = [
    'table[rowkey="ruleId"] tbody tr.cds-table__row',
    'table[rowkey="ruleId"] tr.cds-table__row',
    // Fallbacks in case the rowkey attribute or table structure shifts
    "[data-rule-id]",
    ".rule-row",
    "tr[class*='rule']",
    "table tbody tr",
  ];

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    if (elements.length > 0) return elements;
  }

  return [];
}

// ---------------------------------------------------------------------------
// findDefaultRuleRows — fallback search for default/catch-all rules (e.g.
// "For all private access", "All Internet access") that live in a visually
// separate "Default rules" section from the "Access control rules" table
// findRuleRows() targets.
//
// CONFIRMED via live inspection (org 8176184): the Default rules section is
// its own <table class="... policy-default-rule-table">, a stable
// (non-hashed) class distinct from the hashed classes on the same element —
// same tbody > tr.cds-table__row row shape as the main table, just scoped to
// this separate table instance. Row text lives in <td><div><span> here
// (no <p class="cds-text__weight--bold"> like the main table), but
// getRuleName()'s td:first-child fallback already handles that correctly
// since that first cell contains only the rule-name text.
// ---------------------------------------------------------------------------
function findDefaultRuleRows() {
  const confirmed = Array.from(
    document.querySelectorAll("table.policy-default-rule-table tbody tr.cds-table__row")
  );
  if (confirmed.length > 0) return confirmed;

  // Unconfirmed fallback heuristics, kept in case Cisco renames
  // policy-default-rule-table in a future redeploy.
  const selectors = [
    '[data-testid*="default" i] tr',
    '[class*="default" i] tr',
  ];

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    if (elements.length > 0) return elements;
  }

  // Heading-text heuristic: find an element whose own text is (roughly)
  // "Default rules", then search for row/card-like descendants that come
  // AFTER it in the document — resilient to unknown/changing markup since
  // it doesn't depend on a specific class or attribute, only on visible
  // text Cisco is unlikely to remove entirely.
  //
  // A heading is very often a SIBLING of its section's content (e.g.
  // <h2>Default rules</h2><table>...</table>), not an ancestor of it — so
  // searching heading.closest(...) alone can miss it, and searching a
  // broader ancestor (e.g. <body>) without filtering can wrongly include
  // unrelated rows that appear BEFORE the heading (caught while testing
  // this against a mock DOM: it was matching the earlier custom-rules
  // table too). Filtering by document position fixes both.
  const headingCandidates = Array.from(
    document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,div")
  ).filter((el) => el.children.length === 0 && /default rules/i.test(el.textContent || ""));

  for (const heading of headingCandidates) {
    // Prefer the heading's immediate next sibling (the common case).
    const candidateContainers = [heading.nextElementSibling, heading.parentElement].filter(Boolean);

    for (const container of candidateContainers) {
      const rows = Array.from(
        container.querySelectorAll('tr, [class*="row" i], [data-testid*="rule" i]')
      ).filter((el) => heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

      if (rows.length > 0) return rows;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// getRuleName — extracts the rule name text from a row element.
//
// Real DOM: the rule name lives in a <p class="... cds-text cds-text--p3
// cds-text__weight--bold"> nested inside a cell — the bold-weight text is
// specific to the name column (other columns use non-bold text). Only the
// stable "cds-text__weight--bold" class is matched (see findRuleRows()
// comment above re: hashed vs. stable classes).
// ---------------------------------------------------------------------------

function getRuleName(element) {
  const name =
    element.querySelector("p.cds-text__weight--bold")?.textContent ||
    element.querySelector("[data-rule-name]")?.textContent ||
    element.querySelector(".rule-name")?.textContent ||
    element.querySelector("td:first-child")?.textContent ||
    element.textContent.trim().split("\n")[0];

  return (name || "unknown").trim();
}

// ---------------------------------------------------------------------------
// annotateRules — matches findings to rule rows and injects badges
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

function annotateRules(findings) {
  const rows = findRuleRows();
  let annotated = 0;

  for (const element of rows) {
    // Skip rows already annotated in this pass
    if (element.dataset.secChecked === "true") continue;

    const rowName = getRuleName(element).toLowerCase();

    const matches = findings.filter(
      f => f.ruleName.trim().toLowerCase() === rowName
    );

    if (matches.length === 0) continue;

    // Pick the highest-severity finding only
    const topMatch = matches.sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    )[0];

    injectBadge(element, topMatch);
    annotated++;
  }

  console.log(`[SecPolicyChecker] Annotated ${annotated} of ${rows.length} rule rows with findings`);
}

// ---------------------------------------------------------------------------
// initAnnotations — fetches latest findings and kicks off annotation +
// MutationObserver for SPA navigation / dynamic renders
// ---------------------------------------------------------------------------

function initAnnotations() {
  api.runtime.sendMessage({ type: "GET_FINDINGS" }, (response) => {
    if (!response || !response.findings || response.findings.length === 0) {
      console.log(
        "[SecPolicyChecker] No findings available yet — run scan from the extension popup first"
      );
      return;
    }

    const findings = response.findings;
    annotateRules(findings);

    // MutationObserver with 500 ms debounce so we re-annotate after
    // dynamic rule rows render without firing on every tiny DOM change.
    let debounceTimer = null;

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);                       // reset on each mutation
      debounceTimer = setTimeout(() => {                 // fire after 500 ms quiet
        annotateRules(findings);
      }, 500);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// ---------------------------------------------------------------------------
// highlightRule — scroll to and flash a rule row matching ruleName
// ---------------------------------------------------------------------------

/**
 * Inject the yellow-flash keyframe style once into <head>, then find the DOM
 * row whose displayed name matches `ruleName`, scroll it into view, and apply
 * the flash class for 2 s.
 *
 * findRuleRows() / getRuleName() target the real Cisco Secure Access
 * dashboard DOM (CDS components, matched via stable unhashed classes — see
 * the comment above findRuleRows()). If the dashboard's DOM structure
 * changes in a future Cisco redeploy, this will log a warning below when no
 * matching row is found, which is the signal to re-inspect and update them.
 *
 * @param {string} ruleName
 * @param {string[]} [matchedConditions] - Test Policy's "Matched because"
 *   reasoning, passed through from popup.js when triggered from a Test
 *   Policy result (absent/undefined when triggered from the Rules tab).
 *   When present, also shows the hover popover on the matched row with this
 *   specific reasoning — see showPopoverForRule() below.
 */
function highlightRule(ruleName, matchedConditions) {
  // Inject highlight style once
  if (!document.getElementById("sec-highlight-style")) {
    const style = document.createElement("style");
    style.id = "sec-highlight-style";
    style.textContent = `
      @keyframes sec-flash {
        0%   { background-color: #fff94d; outline: 4px solid #f6ff00; outline-offset: -2px; box-shadow: 0 0 14px 3px rgba(246, 255, 0, 0.85); }
        85%  { background-color: #fff94d; outline: 4px solid #f6ff00; outline-offset: -2px; box-shadow: 0 0 14px 3px rgba(246, 255, 0, 0.85); }
        100% { background-color: transparent; outline: 4px solid transparent; outline-offset: -2px; box-shadow: 0 0 0 0 rgba(246, 255, 0, 0); }
      }
      .sec-highlight {
        animation: sec-flash 3.5s ease-out forwards;
        border-radius: 3px;
        position: relative;
        z-index: 1;
      }
    `;
    document.head.appendChild(style);
  }

  // Try the "Access control rules" table first (unchanged, confirmed
  // behavior for custom rules), then fall back to the default-rules search
  // if not found there — default/catch-all rules (e.g. "For all private
  // access") may live in a separate section (see findDefaultRuleRows()).
  const rows = findRuleRows();
  let target = rows.find(
    (row) => getRuleName(row).toLowerCase() === ruleName.toLowerCase()
  );

  if (!target) {
    const defaultRows = findDefaultRuleRows();
    target = defaultRows.find(
      (row) => getRuleName(row).toLowerCase() === ruleName.toLowerCase()
    );
  }

  if (!target) {
    console.warn(
      `[SecPolicyChecker] HIGHLIGHT_RULE: no row found for rule name '${ruleName}' in either ` +
      "the Access control rules table or the default-rules fallback search. " +
      "Update findRuleRows()/findDefaultRuleRows() selectors to match the real dashboard DOM."
    );
    return;
  }

  // Remove any existing highlight before re-applying (handles rapid clicks)
  target.classList.remove("sec-highlight");
  // Force reflow so removing+re-adding the class restarts the animation
  void target.offsetWidth;
  target.classList.add("sec-highlight");
  target.scrollIntoView({ behavior: "smooth", block: "center" });

  // Clean up after animation completes (3.5 s — matches sec-flash duration)
  setTimeout(() => target.classList.remove("sec-highlight"), 3500);

  // Also show the rich hover popover (same one used for hovering chips) on
  // this row, anchored to a source/destination chip if the row has one
  // (falls back to the row itself, which still works fine as an anchor for
  // positioning purposes). Only fires when triggered from a Test Policy
  // result — matchedConditions is undefined when triggered from the Rules
  // tab, and there's nothing test-specific to show in that case (hovering
  // the row's own chips already covers it).
  if (Array.isArray(matchedConditions) && matchedConditions.length > 0) {
    const anchorEl = target.querySelector(CHIP_SELECTOR) || target;
    clearTimeout(hoverHideTimer);
    showPopoverForRule(anchorEl, ruleName, matchedConditions, TRIGGERED_POPOVER_AUTO_HIDE_MS);
  }
}

// ---------------------------------------------------------------------------
// Hover popover — shows rule-matching details when hovering a source/
// destination chip in the Access Control Rules table on the live dashboard.
//
// Confirmed via live inspection: destination chips are <div
// data-testid="policy-destination-item">, with the visible (truncated) text
// in a nested ".cds-tag__children--wrap". "policy-source-item" is assumed
// analogous for the Sources column but has NOT been independently confirmed
// live — if it doesn't exist, that half of CHIP_SELECTOR just matches zero
// elements and this feature silently does nothing for source chips (no
// error either way).
//
// This is a SEPARATE popover from Cisco's own native tooltip (rendered via
// a floating-ui portal on hover) — we don't touch that tooltip's DOM at all,
// we just position our own element near the chip.
// ---------------------------------------------------------------------------

const CHIP_SELECTOR = '[data-testid="policy-destination-item"], [data-testid="policy-source-item"]';
const HOVER_HIDE_DELAY_MS = 150;
// Programmatically-triggered popovers (from "Highlight on page") aren't
// under a real hover, so there's no natural mouseleave to close them —
// unlike genuine chip hovers, which keep using HOVER_HIDE_DELAY_MS. A few
// seconds gives the user time to read the match reasoning; moving their
// mouse onto the popover to read longer still cancels this via the
// popover's own existing mouseenter listener (see getHoverPopoverEl()),
// same as normal hover behavior — so it degrades to "stay open until the
// user moves away" once they actually engage with it.
const TRIGGERED_POPOVER_AUTO_HIDE_MS = 4000;

let hoverPopoverEl = null;
let hoverHideTimer = null;
const attachedChips = new WeakSet();

// Cisco Hummingbird (hbr) token VALUES duplicated here as literals — this
// stylesheet is injected into the live dashboard's own document (a separate
// DOM/document context from the extension popup), so it cannot see the
// var(--hbr-*) custom properties defined in popup.html's :root. If the
// tokens in popup.html ever change, these literals must be updated to match
// by hand. See popup/popup.html for the canonical token definitions.
function ensureHoverPopoverStyle() {
  if (document.getElementById("sec-hover-popover-style")) return;
  const style = document.createElement("style");
  style.id = "sec-hover-popover-style";
  style.textContent = `
    #sec-hover-popover {
      position: fixed;
      z-index: 2147483647;
      max-width: 320px;
      background: #FFFFFF;
      border: 1px solid #E1E4E8;
      border-radius: 0.50rem;
      box-shadow: 0 6px 20px rgba(0,0,0,0.18);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: #373C42;
      display: none;
      overflow: hidden;
    }
    #sec-hover-popover.sec-hover-visible { display: block; }
    #sec-hover-popover .sec-hp-header {
      background: #2774D9; /* Cisco blue brand header — matches extension popup toolbar (--hbr-color-header in popup.html) */
      color: #fff;
      font-weight: 600;
      font-size: 12.5px;
      padding: 8px 10px;
      word-break: break-word;
    }
    #sec-hover-popover .sec-hp-body { padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
    #sec-hover-popover .sec-hp-meta { display: flex; gap: 8px; align-items: center; }
    /* BLOCK/ALLOW/ISOLATE/unknown action colors are semantic, not brand palette — left unchanged */
    #sec-hover-popover .sec-hp-action {
      display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px;
      border-radius: 9999px; color: #fff; letter-spacing: 0.05em;
    }
    #sec-hover-popover .sec-hp-action-allow   { background: #16a34a; }
    #sec-hover-popover .sec-hp-action-block   { background: #c0392b; }
    #sec-hover-popover .sec-hp-action-isolate { background: #7c3aed; } /* distinct purple — see popup-sections.js COLOR audit, not yet seen live */
    #sec-hover-popover .sec-hp-action-unknown { background: #6b7280; }
    #sec-hover-popover .sec-hp-priority { color: #596069; font-size: 11px; }
    #sec-hover-popover .sec-hp-findings { display: flex; flex-direction: column; gap: 4px; }
    #sec-hover-popover .sec-hp-finding  { font-size: 11px; line-height: 1.4; }
    #sec-hover-popover .sec-hp-empty    { color: #596069; font-style: italic; }
    #sec-hover-popover .sec-hp-match-title {
      font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      color: #596069; margin-top: 4px; padding-top: 6px; border-top: 1px solid #E1E4E8;
    }
    #sec-hover-popover .sec-hp-match { display: flex; flex-direction: column; gap: 3px; }
    #sec-hover-popover .sec-hp-match-item { font-size: 11px; line-height: 1.4; color: #373C42; }
    /* Triggered from "Highlight on page" — visually distinct (blue accent,
       matches --hbr-color-accent) from the passive "What this rule matches"
       summary, so it's clear this is test-specific reasoning, not generic
       rule info. */
    #sec-hover-popover .sec-hp-reason-title { color: #2774D9; border-top-color: #2774D9; }
    #sec-hover-popover .sec-hp-reason {
      background: #EAF1FC; border-left: 2px solid #2774D9; padding: 6px 8px; border-radius: 0.25rem;
    }
  `;
  document.head.appendChild(style);
}

function getHoverPopoverEl() {
  ensureHoverPopoverStyle();
  if (!hoverPopoverEl) {
    hoverPopoverEl = document.createElement("div");
    hoverPopoverEl.id = "sec-hover-popover";
    document.body.appendChild(hoverPopoverEl);

    // Interactive: keep it open if the mouse moves from the chip onto the
    // popover itself (e.g. to read a long finding message), same 150ms
    // hide-delay pattern as leaving the chip.
    hoverPopoverEl.addEventListener("mouseenter", () => clearTimeout(hoverHideTimer));
    hoverPopoverEl.addEventListener("mouseleave", scheduleHideHoverPopover);
  }
  return hoverPopoverEl;
}

function scheduleHideHoverPopover(delayMs) {
  clearTimeout(hoverHideTimer);
  hoverHideTimer = setTimeout(() => {
    if (hoverPopoverEl) hoverPopoverEl.classList.remove("sec-hover-visible");
  }, delayMs !== undefined ? delayMs : HOVER_HIDE_DELAY_MS);
}

// Positioned below/right of the chip (not directly above it) specifically so
// we don't overlap Cisco's own floating-ui tooltip, which renders adjacent
// to/above the chip on hover.
function positionHoverPopover(popover, chipRect) {
  const margin = 8;
  let top = chipRect.bottom + margin;
  let left = chipRect.left;

  const { width, height } = popover.getBoundingClientRect();

  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - width - margin);
  }
  if (top + height > window.innerHeight - margin) {
    // Not enough room below — flip above the chip instead.
    top = chipRect.top - height - margin;
  }

  popover.style.top  = `${Math.max(margin, top)}px`;
  popover.style.left = `${Math.max(margin, left)}px`;
}

// ---------------------------------------------------------------------------
// loadLookups / summarizeConditions — duplicated from popup-sections.js
// (same convention already used for the hbr design tokens and the
// condition-dimension bucketing in service-worker.js: content-script.js runs
// in the dashboard page's own document, a separate execution context from
// the popup, so it can't call popup-sections.js's functions directly — they
// live nested inside that file's buildRulesList() closure and aren't
// exported via window.PopupSections anyway).
//
// summarizeConditions() below is copied verbatim (same switch cases, same
// bitfieldPosition-vs-categoryId handling, same application_ids apps/
// protocols dual-lookup) so the dashboard popover shows the exact same
// "what this rule matches" text as the Rules tab card, not a simplified or
// diverging version.
//
// loadLookups() differs from popup-sections.js's version out of necessity:
// popup-sections.js fetches "../data/*.json" (relative to popup.html's own
// URL, which works because that request resolves against the extension's
// own origin). A content script's fetch() resolves relative to the
// DASHBOARD page's origin instead, so a relative path would 404 — this
// version uses api.runtime.getURL() to build an absolute chrome-extension://
// URL, the same technique already used for the iframe's src in
// initEmbeddedPopup().
// ---------------------------------------------------------------------------

let hoverLookupsPromise = null;
function loadLookups() {
  if (!hoverLookupsPromise) {
    hoverLookupsPromise = Promise.all([
      fetch(api.runtime.getURL("data/categories-lookup.json")).then((r) => r.json()).catch(() => ({})),
      fetch(api.runtime.getURL("data/apps-lookup.json")).then((r) => r.json()).catch(() => ({})),
      fetch(api.runtime.getURL("data/protocols-lookup.json")).then((r) => r.json()).catch(() => ({})),
    ]).then(([categories, apps, protocols]) => ({ categories, apps, protocols }));
  }
  return hoverLookupsPromise;
}

// identities differs from categories/apps/protocols above: those are static
// JSON shipped with the extension, this is live per-org data resolved by
// service-worker.js's resolveIdentities() during the most recent RUN_SCAN
// and cached in chrome.storage.session. This content script runs in its own
// execution context (separate from popup.js), so it can't read popup.js's
// in-memory copy — GET_IDENTITY_MAP asks the service worker for its cached
// copy instead. NOT cached at module scope like hoverLookupsPromise, since
// the map only exists after at least one successful scan and can go stale
// between hovers — re-fetching per hover is cheap (just a storage read).
function loadIdentityMap() {
  return new Promise((resolve) => {
    api.runtime.sendMessage({ type: "GET_IDENTITY_MAP" }, (response) => {
      if (api.runtime.lastError || !response) {
        resolve({});
        return;
      }
      resolve(response.identityMap || {});
    });
  });
}

// Same live per-org pattern as loadIdentityMap() above, but for
// private_resource_ids/private_resource_group_ids — resolved by
// service-worker.js's resolveObjectRefs() and cached separately (different
// ID space, see popup.js's currentObjectMap comment).
function loadObjectMap() {
  return new Promise((resolve) => {
    api.runtime.sendMessage({ type: "GET_OBJECT_MAP" }, (response) => {
      if (api.runtime.lastError || !response) {
        resolve({});
        return;
      }
      resolve(response.objectMap || {});
    });
  });
}

function summarizeConditions(rule, lookups) {
  const conds = rule.ruleConditions || rule.conditions || [];
  if (!Array.isArray(conds) || conds.length === 0) {
    return [{ text: "Applies to all traffic (no specific conditions)", raw: null }];
  }

  const summaries = [];
  for (const c of conds) {
    const type = c.attributeName;
    const values = c.attributeValue;

    if (!type || values === undefined) continue;

    let summaryText = "";
    switch (type) {
      case "umbrella.source.all":
      case "umbrella.destination.all":
        if (values === true) summaryText = `${type.split(".")[1]} = Any`;
        break;
      case "umbrella.source.identity_ids": {
        // Same resolution as popup-sections.js's identical case — see that
        // file's comment for the full explanation of what identityMap
        // (lookups.identities here) covers and why some IDs may still fall
        // back to raw.
        const identityNames = (Array.isArray(values) ? values : [values]).map((id) => {
          const name = lookups.identities && lookups.identities[String(id)];
          return name || `[unknown identity ${id}]`;
        });
        summaryText = `Identities: ${identityNames.join(", ")}`;
        break;
      }
      case "umbrella.destination.application_category_ids":
      case "umbrella.destination.category_ids": // alias — same concept, different field name per org (see matcher.js)
        // values here are bitfieldPosition, not categoryId — categories-lookup.json
        // is keyed by bitfieldPosition for exactly this reason (see data/categories-lookup.json).
        const catNames = Array.isArray(values) ? values.map((id) => {
          const entry = lookups.categories[id];
          if (!entry) return `[unknown category ${id}]`;
          return typeof entry === "object" ? entry.name : entry;
        }) : [];
        summaryText = `App Categories: ${catNames.length ? catNames.join(", ") : values}`;
        break;
      case "umbrella.destination.application_ids": {
        // CONFIRMED via live API payload: umbrella.destination.application_ids is
        // the ONLY field used for both Internet Applications AND Application
        // Protocols — there is no separate umbrella.destination.protocol_ids field.
        // Resolve against apps-lookup.json first, then protocols-lookup.json.
        const appMatches = [];
        const protoMatches = [];
        const unresolved = [];
        for (const id of Array.isArray(values) ? values : []) {
          if (lookups.apps[id] !== undefined) {
            appMatches.push(lookups.apps[id]);
          } else if (lookups.protocols[id] !== undefined) {
            protoMatches.push(lookups.protocols[id]);
          } else {
            unresolved.push(id);
          }
        }
        const parts = [];
        if (appMatches.length) parts.push(`Applications: ${appMatches.join(", ")}`);
        if (protoMatches.length) parts.push(`Protocols: ${protoMatches.join(", ")}`);
        if (unresolved.length) parts.push(`Applications: ${unresolved.map((id) => `[unknown app ${id}]`).join(", ")}`);
        summaryText = parts.length ? parts.join(" ; ") : `Applications: ${values}`;
        break;
      }
      case "umbrella.destination.composite_inline_ip":
        if (Array.isArray(values)) {
          const destParts = [];
          values.forEach((v) => {
            if (typeof v === "object" && v !== null) {
              const parts = [];
              if (v.ip) parts.push(`IP: ${Array.isArray(v.ip) ? v.ip.join(", ") : v.ip}`);
              if (v.protocol) parts.push(`Proto: ${v.protocol}`);
              if (v.port) parts.push(`Port: ${Array.isArray(v.port) ? v.port.join(", ") : v.port}`);
              destParts.push(`Destination: ${parts.join(" | ")}`);
            } else {
              destParts.push(`Destination IP: ${v}`);
            }
          });
          summaryText = destParts.join(" ; ");
        }
        break;
      case "umbrella.destination.destination_list_ids": {
        // CONFIRMED via live API payload (org 8176184). No lookup for destination-list
        // names — falls back to plain English with the ID visible (see popup-sections.js
        // for the primary copy of this case and its full comment).
        const ids = Array.isArray(values) ? values : [values];
        summaryText = ids.length === 1
          ? `Matches a specific destination list (ID ${ids[0]})`
          : `Matches specific destination lists (IDs ${ids.join(", ")})`;
        break;
      }
      case "umbrella.destination.appRiskProfileId": {
        // CONFIRMED via live API payload. No lookup for App Risk Profile names
        // (see popup-sections.js for the primary copy of this case).
        const ids = Array.isArray(values) ? values : [values];
        summaryText = ids.length === 1
          ? `Matches destinations with a specific App Risk Profile (ID ${ids[0]})`
          : `Matches destinations with specific App Risk Profiles (IDs ${ids.join(", ")})`;
        break;
      }
      case "umbrella.destination.private_resource_ids":
      case "umbrella.destination.private_resource_group_ids": {
        // Resolved via resolveObjectRefs() in service-worker.js, fetched
        // here through loadObjectMap()/GET_OBJECT_MAP (see popup-sections.js
        // for the primary copy of this case and its full comment).
        const isGroup = type.endsWith("_group_ids");
        const label = isGroup ? "Private Resource Groups" : "Private Resources";
        const resNames = (Array.isArray(values) ? values : [values]).map((id) => {
          const name = lookups.objects && lookups.objects[String(id)];
          return name || `[unknown resource ${id}]`;
        });
        summaryText = `${label}: ${resNames.join(", ")}`;
        break;
      }
      default: {
        // Generic fallback for any unrecognized umbrella.* condition type —
        // see popup-sections.js for the full comment on why this exists.
        const humanized = type
          .replace(/^umbrella\./, "")
          .replace(/\./g, " ")
          .replace(/_/g, " ")
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .toLowerCase()
          .trim();
        summaryText = `Matches a specific ${humanized} condition${Array.isArray(values) ? ` (${values.join(", ")})` : ` (${values})`}`;
        break;
      }
    }
    if (summaryText) {
      summaries.push({ text: summaryText, raw: { attributeName: type, attributeOperator: c.attributeOperator, attributeValue: values } });
    }
  }
  return summaries.length ? summaries : [{ text: "Has conditions, but of unknown types", raw: null }];
}

// testMatchReasons: the Test Policy result's "Matched because" strings,
// passed through from a "Highlight on page" click (see highlightRule()).
// When present, this REPLACES the generic "What this rule matches" summary
// (summarizeConditions() output) with the specific reasoning for the exact
// test the user ran — showing both would be redundant/confusing (one is
// "what this rule matches in general", the other is "why YOUR test matched
// it"). Findings are still shown either way ("in addition to findings").
function appendMatchReasonSection(body, reasons) {
  const title = document.createElement("div");
  title.className = "sec-hp-match-title sec-hp-reason-title";
  title.textContent = "Why your test matched this rule";
  body.appendChild(title);

  const wrap = document.createElement("div");
  wrap.className = "sec-hp-match sec-hp-reason";
  for (const reason of reasons) {
    const row = document.createElement("div");
    row.className = "sec-hp-match-item";
    row.textContent = reason;
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
}

function renderHoverPopoverContent(popover, ruleName, rule, findings, matchSummary, testMatchReasons) {
  popover.innerHTML = "";

  const header = document.createElement("div");
  header.className = "sec-hp-header";
  header.textContent = ruleName;
  popover.appendChild(header);

  const body = document.createElement("div");
  body.className = "sec-hp-body";

  const hasReasons = Array.isArray(testMatchReasons) && testMatchReasons.length > 0;

  if (!rule) {
    if (hasReasons) {
      appendMatchReasonSection(body, testMatchReasons);
    } else {
      const empty = document.createElement("div");
      empty.className = "sec-hp-empty";
      empty.textContent = "Open the extension popup to see rule findings.";
      body.appendChild(empty);
    }
    popover.appendChild(body);
    return;
  }

  const meta = document.createElement("div");
  meta.className = "sec-hp-meta";

  const action = (rule.action || "unknown").toLowerCase();
  const actionBadge = document.createElement("span");
  actionBadge.className = `sec-hp-action sec-hp-action-${["allow", "block", "isolate"].includes(action) ? action : "unknown"}`;
  actionBadge.textContent = action.toUpperCase();
  meta.appendChild(actionBadge);

  // No unconditional "Priority X" — this popover is anchored directly on
  // top of the dashboard's own "#" row-order column, so it was just
  // repeating a number already visible right next to it. Only shown for
  // default/catch-all rules, since "always evaluated last" is genuinely new
  // context the dashboard doesn't spell out (same reasoning as the popup's
  // Rules tab and Test Policy result cards — see popup-sections.js).
  if (rule.is_default) {
    const priority = document.createElement("span");
    priority.className = "sec-hp-priority";
    priority.textContent = "Default rule (always evaluated last)";
    meta.appendChild(priority);
  }

  body.appendChild(meta);

  // Reuses the same severity badge classes (sec-badge / sec-badge-<severity>)
  // already defined in content/styles.css for the inline rule-row badges.
  const findingsWrap = document.createElement("div");
  findingsWrap.className = "sec-hp-findings";

  if (!findings || findings.length === 0) {
    const clean = document.createElement("div");
    clean.className = "sec-hp-empty";
    clean.textContent = "No findings for this rule.";
    findingsWrap.appendChild(clean);
  } else {
    for (const f of findings) {
      const row = document.createElement("div");
      row.className = "sec-hp-finding";

      const badge = document.createElement("span");
      badge.className = `sec-badge sec-badge-${f.severity}`;
      badge.textContent = f.severity.toUpperCase();

      row.appendChild(badge);
      row.appendChild(document.createTextNode(` ${f.message}`));
      findingsWrap.appendChild(row);
    }
  }

  body.appendChild(findingsWrap);

  if (hasReasons) {
    appendMatchReasonSection(body, testMatchReasons);
  } else {
    // "What this rule matches" — below findings, same summarizeConditions()
    // output as the Rules tab card's "WHAT WILL USUALLY MATCH" section.
    const matchTitle = document.createElement("div");
    matchTitle.className = "sec-hp-match-title";
    matchTitle.textContent = "What this rule matches";
    body.appendChild(matchTitle);

    const matchWrap = document.createElement("div");
    matchWrap.className = "sec-hp-match";
    const summaries = matchSummary || [{ text: "Match summary unavailable.", raw: null }];
    for (const mc of summaries) {
      const row = document.createElement("div");
      row.className = "sec-hp-match-item";
      row.textContent = mc.text;
      matchWrap.appendChild(row);
    }
    body.appendChild(matchWrap);
  }

  popover.appendChild(body);
}

// Reuses the existing GET_RULES / GET_FINDINGS messages to service-worker.js
// (session-storage reads of data already fetched by RUN_SCAN) — does NOT
// trigger a new live API fetch.
function loadRulesAndFindings(callback) {
  let rules = null, findings = null;
  const maybeDone = () => {
    if (rules === null || findings === null) return;
    callback(rules, findings);
  };

  api.runtime.sendMessage({ type: "GET_RULES" }, (response) => {
    rules = (response && response.rules) || [];
    maybeDone();
  });
  api.runtime.sendMessage({ type: "GET_FINDINGS" }, (response) => {
    findings = (response && response.findings) || [];
    maybeDone();
  });
}

// Shared by both genuine chip hovers and the "Highlight on page" triggered
// popover (see highlightRule()). testMatchReasons and autoHideMs are both
// optional — omitted for normal hover (generic content, hover-only dismiss),
// provided for the triggered case (test-specific reasoning, timed dismiss).
function showPopoverForRule(anchorEl, ruleName, testMatchReasons, autoHideMs) {
  const anchorRect = anchorEl.getBoundingClientRect();
  const popover = getHoverPopoverEl();

  function reveal() {
    popover.classList.add("sec-hover-visible");
    positionHoverPopover(popover, anchorRect);
    if (autoHideMs !== undefined) scheduleHideHoverPopover(autoHideMs);
  }

  loadRulesAndFindings((rules, findings) => {
    if (rules.length === 0 && findings.length === 0) {
      renderHoverPopoverContent(popover, ruleName, null, null, null, testMatchReasons);
      reveal();
      return;
    }

    const lowerName = ruleName.toLowerCase();
    const rule = rules.find(r => (r.name || "").trim().toLowerCase() === lowerName);
    const ruleFindings = findings.filter(f => f.ruleName.trim().toLowerCase() === lowerName);

    if (!rule) {
      renderHoverPopoverContent(popover, ruleName, null, ruleFindings, null, testMatchReasons);
      reveal();
      return;
    }

    // Match summary needs the lookup JSONs (categories/apps/protocols) plus
    // the live identityMap and objectMap — fetched lazily, see loadLookups()/
    // loadIdentityMap()/loadObjectMap() above. Still fetched even when
    // testMatchReasons is provided, in case some future caller wants both
    // sections; renderHoverPopoverContent() itself decides which one to
    // actually show.
    Promise.all([loadLookups(), loadIdentityMap(), loadObjectMap()]).then(([lookups, identityMap, objectMap]) => {
      lookups.identities = identityMap;
      lookups.objects = objectMap;
      const matchSummary = summarizeConditions(rule, lookups);
      renderHoverPopoverContent(popover, ruleName, rule, ruleFindings, matchSummary, testMatchReasons);
      reveal();
    });
  });
}

function handleChipMouseEnter(event) {
  const chip = event.currentTarget;
  clearTimeout(hoverHideTimer);

  const row = chip.closest("tr");
  if (!row) return;

  const ruleName = getRuleName(row);
  showPopoverForRule(chip, ruleName, null, undefined);
}

function handleChipMouseLeave() {
  scheduleHideHoverPopover();
}

function attachChipListeners() {
  const chips = document.querySelectorAll(CHIP_SELECTOR);
  for (const chip of chips) {
    if (attachedChips.has(chip)) continue;
    attachedChips.add(chip);
    chip.addEventListener("mouseenter", handleChipMouseEnter);
    chip.addEventListener("mouseleave", handleChipMouseLeave);
  }
}

function initHoverPopover() {
  attachChipListeners();

  // SPA re-renders (sort/filter/pagination) create new chip elements, so
  // re-scan on DOM mutation rather than relying on a one-time query — same
  // debounce pattern as annotateRules()'s observer below.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(attachChipListeners, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Embedded popup — injects the extension's existing popup.html as a toggled
// iframe panel on the dashboard page itself, as an alternative to only being
// reachable via the toolbar icon. This is a placement/injection wrapper only
// — popup.html/popup.js/popup-sections.js/matcher.js are reused completely
// unmodified and load inside the iframe exactly as they do in the toolbar
// popup today.
//
// Positioned bottom-right, separate from the hover popover (which appears
// near hovered chips higher up the page) to avoid overlap. Uses a slightly
// lower z-index (2147483646) than the hover popover's max value
// (2147483647) so the hover popover would still win in the rare case they
// ever visually coincide.
// ---------------------------------------------------------------------------

// popup.html's own body is hardcoded to width: 660px (see popup/popup.html)
// and we were told not to modify popup.html/js — so the panel WIDTH stays
// tied to that real width (plus a small buffer) rather than an arbitrary
// guess; shrinking it further would just push the iframe's own content into
// a horizontal scrollbar, not actually make it smaller. HEIGHT has no such
// constraint (the popup's content scrolls vertically fine at any height —
// #psc-panel-body/rules list just gets a taller/shorter viewport), so it's
// reduced here to cover less of the dashboard behind the panel. The iframe
// still scrolls internally for anything taller than this.
const EMBED_PANEL_WIDTH = 680;
const EMBED_PANEL_HEIGHT = 480;

function ensureEmbeddedPopupStyle() {
  if (document.getElementById("sec-embed-popup-style")) return;
  const style = document.createElement("style");
  style.id = "sec-embed-popup-style";
  style.textContent = `
    #sec-embed-toggle {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 52px;
      height: 52px;
      border-radius: 9999px;
      background: #2774D9; /* Cisco blue brand header — matches extension popup toolbar (--hbr-color-header in popup.html) */
      color: #fff;
      border: none;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 0;
    }
    #sec-embed-toggle:hover { filter: brightness(1.06); }

    /* Glassmorphism pass: translucent frosted border/background + blur on
       the panel FRAME (the iframe's own document — popup.html — carries a
       matching soft gradient-wash background internally, since true
       cross-document blur of the live dashboard through the iframe would
       need the iframe's document background made fully transparent, which
       risks visual bugs we can't verify live against the real dashboard).
       overflow: hidden means this also clips the blur/rounding to the
       panel's rounded corners. */
    #sec-embed-panel {
      position: fixed;
      bottom: 88px;
      right: 24px;
      width: ${EMBED_PANEL_WIDTH}px;
      height: ${EMBED_PANEL_HEIGHT}px;
      max-width: calc(100vw - 48px);
      max-height: calc(100vh - 120px);
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.55);
      border-radius: 0.50rem;
      box-shadow: 0 10px 40px rgba(35, 40, 46, 0.22);
      overflow: hidden;
      z-index: 2147483646;
      display: none;
    }
    #sec-embed-panel.sec-embed-open { display: block; }

    #sec-embed-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      background: transparent;
    }
  `;
  document.head.appendChild(style);
}

function initEmbeddedPopup() {
  if (document.getElementById("sec-embed-toggle")) return; // already injected

  ensureEmbeddedPopupStyle();

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "sec-embed-toggle";
  toggleBtn.title = "Secure Access Policy Checker";
  toggleBtn.textContent = "🛡️";

  const panel = document.createElement("div");
  panel.id = "sec-embed-panel";

  // Loading the extension's own popup.html as an iframe src requires it (and
  // everything it loads: popup.js, popup-sections.js, matcher.js, mock-api.js,
  // and the data/*.json lookups fetched at runtime) to be listed in
  // manifest.json's web_accessible_resources — see manifest.json.
  const iframe = document.createElement("iframe");
  iframe.id = "sec-embed-iframe";
  
  // Extract orgId from URL and pass it directly in the iframe src
  // This is more reliable than the postMessage handshake
  const orgMatch = window.location.href.match(/\/org\/(\d+)/);
  const orgId = orgMatch ? orgMatch[1] : null;
  const iframeSrc = api.runtime.getURL("popup/popup.html") + (orgId ? `?orgId=${orgId}` : "");
  iframe.src = iframeSrc;
  panel.appendChild(iframe);

  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);

  // ---------------------------------------------------------------------
  // Org-ID handshake for popup.js running inside this iframe.
  //
  // The iframe is cross-origin (chrome-extension://<id> embedded in this
  // https://*.cisco.com/* page), so popup.js CANNOT read window.parent's
  // location — the same-origin policy blocks reading a cross-origin
  // window's .location.href/.pathname/etc (only postMessage() is allowed
  // across origins). But THIS script runs in the dashboard page's own
  // origin/context and has direct access to window.location.href, so we
  // answer popup.js's request for the org ID here instead of it trying
  // (and failing) to read it directly.
  //
  // service-worker.js's chrome.tabs.query()-based org-ID detection (used
  // by the toolbar-popup path) is left completely unchanged — this is an
  // additive path only used when popup.js detects it's embedded.
  // ---------------------------------------------------------------------
  function extractOrgIdFromUrl(url) {
    const match = (url || "").match(/\/org\/(\d+)/);
    return match ? match[1] : null;
  }

  // Cache orgId in storage when we detect it — makes it resilient to timing issues
  // Use the orgId already extracted above for the iframe URL
  if (orgId) {
    chrome.storage.local.set({ cached_org_id: orgId });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    if (!event.data) return;

    if (event.data.type === "SEC_REQUEST_ORG_CONTEXT") {
      // Use cached orgId if extraction failed, or re-extract
      const currentOrgId = orgId || extractOrgIdFromUrl(window.location.href);
      const extensionOrigin = new URL(iframe.src).origin;
      event.source.postMessage({ type: "SEC_ORG_CONTEXT", orgId: currentOrgId }, extensionOrigin);
      return;
    }

    // Sent by popup.js's minimizeEmbeddedPanel() right after a successful
    // Run Test — collapses the panel so the row we just highlighted/scrolled
    // to on the dashboard (see highlightRule()) is actually visible instead
    // of sitting behind the panel.
    if (event.data.type === "SEC_MINIMIZE_PANEL") {
      panel.classList.remove("sec-embed-open");
    }
  });

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("sec-embed-open");
  });

  // Click outside the panel hides it. Note: clicks that happen INSIDE the
  // iframe never reach this listener at all — the iframe is a separate
  // document, so a click there doesn't bubble into the parent dashboard
  // document's event flow. That means this listener only ever fires for
  // genuine clicks on the dashboard page itself, which is exactly "outside
  // the iframe's bounds" — no manual bounding-box hit-testing needed.
  //
  // Toggling display via the .sec-embed-open class (rather than removing/
  // recreating the iframe) means the iframe's document — and therefore
  // popup.js's in-memory scan results — persists across opens/closes for
  // the lifetime of the dashboard page.
  document.addEventListener("mousedown", (e) => {
    if (!panel.classList.contains("sec-embed-open")) return;
    if (panel.contains(e.target) || e.target === toggleBtn) return;
    panel.classList.remove("sec-embed-open");
  });
}

// ---------------------------------------------------------------------------
// Message listener — allows popup to trigger annotation or highlight
// ---------------------------------------------------------------------------

api.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TRIGGER_ANNOTATE") initAnnotations();

  if (msg.type === "HIGHLIGHT_RULE") {
    highlightRule(msg.ruleName, msg.matchedConditions);
  }
});

// ---------------------------------------------------------------------------
// Run on page load
// ---------------------------------------------------------------------------

initAnnotations();
initHoverPopover();
initEmbeddedPopup();
