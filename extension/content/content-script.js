var api = typeof browser !== 'undefined' ? browser : chrome;

// Reloading an unpacked MV3 extension can leave the previous content script
// in the same page. A second inject must stop immediately; otherwise `const`
// declarations throw "already been declared" and break the hover card.
if (window.__secPolicyCheckerInjected) {
  // Stale leftover — do not rebind listeners or redeclare locals.
} else {
window.__secPolicyCheckerInjected = true;

// Reloading an unpacked MV3 extension invalidates content scripts already
// injected into dashboard tabs. A stale script must quietly stop instead of
// throwing from a later hover/message callback; the fresh script takes over
// after the dashboard tab is reloaded.
function runtimeUrl(path) {
  try {
    return api && api.runtime && api.runtime.id ? api.runtime.getURL(path) : null;
  } catch (_) {
    return null;
  }
}

function safeRuntimeMessage(message, callback) {
  try {
    if (!api || !api.runtime || !api.runtime.id) {
      if (callback) callback(null);
      return false;
    }
    api.runtime.sendMessage(message, (response) => {
      try {
        if (api.runtime.lastError) {
          if (callback) callback(null);
          return;
        }
        if (callback) callback(response);
      } catch (_) {
        if (callback) callback(null);
      }
    });
    return true;
  } catch (_) {
    if (callback) callback(null);
    return false;
  }
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
      .sec-highlight td {
        background-color: rgba(148, 163, 184, 0.12) !important;
        border-top: 2px solid #94a3b8 !important;
        border-bottom: 2px solid #94a3b8 !important;
        box-shadow: inset 0 0 8px rgba(148, 163, 184, 0.15);
        transition: background-color 0.3s ease, box-shadow 0.3s ease;
      }
      .sec-highlight td:first-child {
        border-left: 4px solid #94a3b8 !important;
        border-radius: 0;
      }
      .sec-highlight td:last-child {
        border-right: 4px solid #94a3b8 !important;
        border-radius: 0;
      }
      .sec-highlight {
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

  // Store reference so click-outside handler can remove it
  currentHighlightEl = target;

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
    showPopoverForRule(anchorEl, ruleName, matchedConditions);
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

// Live dashboard selectors supplied from the rendered policy table. Source
// uses its column wrapper; destination uses the individual policy item.
var CHIP_SELECTOR = '[data-testid="policy-source-column"], [data-testid="policy-destination-item"]';
var HOVER_ROW_SELECTOR = 'table[rowkey="ruleId"] tr.cds-table__row, table.policy-default-rule-table tr.cds-table__row, [data-rule-id], .rule-row';
var HOVER_HIDE_DELAY_MS = 150;
// Programmatically-triggered popovers (from "Highlight on page") aren't
// under a real hover, so there's no natural mouseleave to close them —
// unlike genuine chip hovers, which keep using HOVER_HIDE_DELAY_MS. A few
// seconds gives the user time to read the match reasoning; moving their
// mouse onto the popover to read longer still cancels this via the
// popover's own existing mouseenter listener (see getHoverPopoverEl()),
// same as normal hover behavior — so it degrades to "stay open until the
// user moves away" once they actually engage with it.
var TRIGGERED_POPOVER_AUTO_HIDE_MS = 4000;

var hoverPopoverEl = null;
var hoverHideTimer = null;
var hoverPointer = null;
var attachedChips = new WeakSet();
var currentHighlightEl = null;
var triggeredDismissListener = null;
// Recursive member popover state (see renderMemberPopover / showMemberPopover).
var currentMemberMaps = {};
var currentLookups = {};
var memberPopoverEl = null;
var memberHideTimer = null;
var memberHoverTimer = null;
var memberDismissListener = null;
var memberOpenKey = null;
var memberRequestSeq = 0;

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
      width: min(440px, calc(100vw - 32px));
      max-height: min(520px, calc(100vh - 32px));
      background: #FFFFFF;
      border: 1px solid #d8e0ea;
      border-left: 4px solid #64748b;
      border-radius: 0;
      box-shadow: 0 18px 42px rgba(15,23,42,0.20);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-weight: 400;
      font-size: 13px;
      color: #1e293b;
      display: none;
      overflow: auto;
      transition: opacity 0.12s ease, transform 0.12s ease;
    }
    #sec-hover-popover[data-action="allow"]  { border-left-color: #166534; }
    #sec-hover-popover[data-action="block"]  { border-left-color: #991b1b; }
    #sec-hover-popover[data-action="isolate"]{ border-left-color: #6b21a8; }
    #sec-hover-popover.sec-hover-visible { display: block; }
    #sec-hover-popover .sec-hp-header {
      background: linear-gradient(135deg, #f8fafc, #eef6ff);
      color: #0f172a;
      font-weight: 700;
      font-size: 14px;
      padding: 12px 14px;
      word-break: break-word;
      border-bottom: 1px solid #dbe5f0;
    }
    #sec-hover-popover .sec-hp-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 10px; }
    #sec-hover-popover .sec-hp-meta { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
    #sec-hover-popover .sec-hp-action {
      display: inline-block; font-size: 10px; font-weight: 800; padding: 4px 9px;
      border-radius: 0; letter-spacing: 0.04em; flex-shrink: 0;
    }
    #sec-hover-popover .sec-hp-action-allow   { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    #sec-hover-popover .sec-hp-action-block   { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    #sec-hover-popover .sec-hp-action-isolate { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
    #sec-hover-popover .sec-hp-action-unknown { background: #f1f5f9; color: #6b7280; border: 1px solid #e2e8f0; }
    #sec-hover-popover .sec-hp-priority { color: #475569; background: #f1f5f9; border-radius: 0; padding: 3px 8px; font-size: 11px; font-weight: 600; }
    #sec-hover-popover .sec-hp-findings { display: flex; flex-direction: column; gap: 5px; }
    #sec-hover-popover .sec-hp-finding  { font-size: 12px; line-height: 1.45; }
    #sec-hover-popover .sec-hp-empty    { color: #64748b; font-style: italic; font-size: 12px; }
    #sec-hover-popover .sec-hp-section {
      font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
      color: #64748b; padding-top: 2px;
    }
    #sec-hover-popover .sec-hp-match-title {
      font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
      color: #64748b; margin-top: 4px; padding-top: 9px; border-top: 1px solid #e2e8f0;
    }
    #sec-hover-popover .sec-hp-match { display: flex; flex-direction: column; gap: 5px; }
    #sec-hover-popover .sec-hp-match-item {
      font-size: 12px; line-height: 1.45; color: #334155;
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0;
      padding: 6px 8px; display: inline-flex; align-items: center; gap: 5px;
      overflow-wrap: anywhere; word-break: break-word;
    }
    #sec-hover-popover .sec-hp-match-key { color: #64748b; font-weight: 600; flex-shrink: 0; }
    #sec-hover-popover .sec-hp-match-val { color: #0f172a; font-weight: 600; overflow-wrap: anywhere; word-break: break-word; }
    #sec-hover-popover .sec-hp-reason-title { color: #0f172a; border-top-color: #e2e8f0; }
    #sec-hover-popover .sec-hp-reason {
      background: #f8fafc; border-left: none; padding: 6px 8px; border-radius: 0;
    }
    /* Condition chips + security profile chips (matches rules tab psc-chip) */
    #sec-hover-popover .sec-hp-chips {
      display: flex; flex-wrap: wrap; gap: 4px;
    }
    #sec-hover-popover .sec-hp-chips.sec-hp-condition-list {
      flex-direction: column; align-items: stretch; gap: 6px;
    }
    #sec-hover-popover .sec-hp-chips.sec-hp-condition-list .sec-hp-chip {
      display: flex; width: 100%; box-sizing: border-box; padding: 7px 9px;
    }
    #sec-hover-popover .sec-hp-chip {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0;
      padding: 2px 6px; font-size: 10.5px; color: #334155;
      display: inline-flex; align-items: center; gap: 4px;
      overflow-wrap: anywhere; word-break: break-word;
    }
    #sec-hover-popover .sec-hp-chip-key { color: #64748b; font-weight: 600; flex-shrink: 0; }
    #sec-hover-popover .sec-hp-chip-val { color: #0f172a; font-weight: 600; overflow-wrap: anywhere; word-break: break-word; }

    /* Expandable source/destination group chips + recursive member popover */
    #sec-hover-popover .sec-hp-chip.sec-hp-expandable {
      cursor: pointer; border-color: #93c5fd; background: #eff6ff; color: #1e40af; font-weight: 600;
    }
    #sec-hover-popover .sec-hp-chip.sec-hp-expandable:hover { background: #dbeafe; }
    #sec-member-popover {
      position: fixed; z-index: 2147483647; width: min(360px, calc(100vw - 32px));
      max-height: min(420px, calc(100vh - 32px)); background: #fff; border: 1px solid #d8e0ea;
      border-left: 4px solid #2563eb; border-radius: 0; box-shadow: 0 18px 42px rgba(15,23,42,0.20);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-weight: 400; font-size: 13px; color: #1e293b; display: none; overflow: auto;
    }
    #sec-member-popover.sec-member-visible { display: block; }
    #sec-member-popover .sec-mp-header {
      background: linear-gradient(135deg, #eff6ff, #dbeafe); color: #0f172a; font-weight: 700;
      font-size: 13px; padding: 10px 12px; border-bottom: 1px solid #dbe5f0; word-break: break-word;
    }
    #sec-member-popover .sec-mp-list { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px 12px; }
    #sec-member-popover .sec-mp-chip {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0; padding: 6px 9px;
      font-size: 12px; color: #334155; overflow-wrap: anywhere; word-break: break-word;
    }
    #sec-member-popover .sec-mp-chip.sec-mp-expandable {
      cursor: pointer; border-color: #93c5fd; background: #eff6ff; color: #1e40af; font-weight: 600;
    }
    #sec-member-popover .sec-mp-chip.sec-mp-expandable:hover { background: #dbeafe; }
    #sec-member-popover .sec-mp-empty { color: #64748b; font-style: italic; font-size: 12px; padding: 4px; }
    @keyframes sec-skel {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }
    .sec-skel {
      background: linear-gradient(90deg, #eef2f7 0%, #f8fafc 45%, #eef2f7 90%);
      background-size: 200% 100%;
      animation: sec-skel 1.1s ease-in-out infinite;
      border: 1px solid #e2e8f0;
    }
    #sec-hover-popover .sec-hp-skel,
    #sec-member-popover .sec-mp-skel {
      height: 28px; width: 100%; box-sizing: border-box;
    }
    #sec-hover-popover .sec-hp-skel-title,
    #sec-member-popover .sec-mp-skel-title {
      height: 14px; width: 42%; margin-bottom: 2px;
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
    hoverPopoverEl.addEventListener("mouseleave", (event) => {
      const next = event.relatedTarget;
      if (memberPopoverEl && next && memberPopoverEl.contains(next)) return;
      scheduleHideHoverPopover();
    });
  }
  return hoverPopoverEl;
}

function hideHoverPopover() {
  if (hoverPopoverEl) hoverPopoverEl.classList.remove("sec-hover-visible");
  hideMemberPopover();
}

function scheduleHideHoverPopover(delayMs) {
  clearTimeout(hoverHideTimer);
  hoverHideTimer = setTimeout(hideHoverPopover, delayMs !== undefined ? delayMs : HOVER_HIDE_DELAY_MS);
}

// Cursor-proximate placement for normal hovers; supports a DOMRect-like
// anchor for programmatic highlight popovers.
function positionHoverPopover(popover, anchor) {
  const margin = 12;
  const point = anchor && typeof anchor.x === "number"
    ? { x: anchor.x, y: anchor.y }
    : { x: anchor.left, y: anchor.bottom };
  let top = point.y + 16;
  let left = point.x + 16;

  const { width, height } = popover.getBoundingClientRect();

  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, point.x - width - 16);
  }
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, point.y - height - 16);
  }

  popover.style.top  = `${top}px`;
  popover.style.left = `${left}px`;
}

// ---------------------------------------------------------------------------
// Recursive member popover — click a source/destination group to expand its
// members. Nested groups expand the same way, to arbitrary depth. Driven
// from the dashboard hover popover's expandable condition chips (see
// renderConditionGroup). A single reused #sec-member-popover is re-targeted
// per click and stays open until the user clicks elsewhere.
// ---------------------------------------------------------------------------

function hideMemberPopover() {
  if (memberPopoverEl) memberPopoverEl.classList.remove("sec-member-visible");
  memberOpenKey = null;
  if (memberDismissListener) {
    document.removeEventListener("mousedown", memberDismissListener, true);
    memberDismissListener = null;
  }
}

function getMemberPopoverEl() {
  if (!memberPopoverEl) {
    memberPopoverEl = document.createElement("div");
    memberPopoverEl.id = "sec-member-popover";
    document.body.appendChild(memberPopoverEl);
    memberPopoverEl.addEventListener("mouseenter", () => clearTimeout(hoverHideTimer));
    memberPopoverEl.addEventListener("mouseleave", (event) => {
      const next = event.relatedTarget;
      if (hoverPopoverEl && next && hoverPopoverEl.contains(next)) return;
      scheduleHideHoverPopover();
    });
  }
  return memberPopoverEl;
}

function lookupName(map, id) {
  if (!map || id === undefined || id === null) return "";
  const raw = map[String(id)] !== undefined ? map[String(id)] : map[id];
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  return raw.name || raw.label || raw.displayName || "";
}

// Resolve a member's display label from membership data first, then the
// already-loaded identity/object catalogs. Never prefer a bare numeric id
// when a name exists somewhere we already fetched.
function resolveMemberLabel(member, memberMaps, lookups) {
  if (member && member.value !== undefined && member.value !== "") return String(member.value);
  if (member && member.name) return String(member.name);
  if (member && member.label) return String(member.label);
  const id = member && member.id !== undefined ? String(member.id) : "";
  if (!id) return "";
  const maps = memberMaps || {};
  const lu = lookups || {};
  const om = lu.objectMaps || {};
  const kindMaps = {
    identityGroups: maps.identityGroups,
    identity: lu.identities,
    networkObjectGroups: maps.networkObjectGroups || om.networkObjectGroups,
    networkObject: om.networkObjects,
    serviceObjectGroups: maps.serviceObjectGroups || om.serviceObjectGroups,
    serviceObject: om.serviceObjects,
    destinationLists: maps.destinationLists || om.destinationLists,
    applicationLists: maps.applicationLists || om.applicationLists,
    application: lu.apps,
    categoryLists: maps.categoryLists || om.categoryLists,
    category: lu.categories,
    privateResourceGroups: maps.privateResourceGroups || om.privateResourceGroups,
    privateResource: om.privateResources,
  };
  const fromKind = lookupName(kindMaps[member.kind], id);
  if (fromKind) return fromKind;
  const fromMember = maps[member.kind] && maps[member.kind][id] && maps[member.kind][id].name;
  if (fromMember) return fromMember;
  return lookupName(lu.identities, id)
    || lookupName(om.privateResources, id)
    || lookupName(om.networkObjects, id)
    || lookupName(om.networkObjectGroups, id)
    || lookupName(om.serviceObjects, id)
    || lookupName(om.serviceObjectGroups, id)
    || lookupName(om.destinationLists, id)
    || lookupName(om.applicationLists, id)
    || lookupName(om.categoryLists, id)
    || lookupName(om.privateResourceGroups, id)
    || lookupName(lu.apps, id)
    || lookupName(lu.categories, id)
    || "";
}

function isExpandableKind(kind) {
  return Boolean(kind && MEMBER_CONDITION_KIND[kind]);
}

function hasCachedMembers(memberMaps, kind, id) {
  const entry = memberMaps && memberMaps[kind] && memberMaps[kind][String(id)];
  if (!entry || !Array.isArray(entry.members) || entry.resolved === false) return false;
  if ((kind === "destinationLists" || kind === "identityGroups" || kind === "sourceNetworks") && !entry.members.length) return false;
  return true;
}

function requestMembers(kind, id, callback) {
  if (hasCachedMembers(currentMemberMaps, kind, id)) {
    const cached = currentMemberMaps[kind][String(id)];
    callback({ ok: true, name: cached.name, members: cached.members, cached: true });
    return;
  }
  safeRuntimeMessage({ type: "RESOLVE_MEMBERS", kind, id: String(id) }, (response) => {
    callback(response || { ok: false, members: [], name: String(id) });
  });
}

function renderMemberPopover(headerTitle, members, memberMaps, lookups, loading) {
  const pop = getMemberPopoverEl();
  pop.innerHTML = "";
  const header = document.createElement("div");
  header.className = "sec-mp-header";
  header.textContent = headerTitle;
  pop.appendChild(header);

  const list = document.createElement("div");
  list.className = "sec-mp-list";

  if (loading) {
    for (let i = 0; i < 4; i++) {
      const row = document.createElement("div");
      row.className = "sec-mp-skel sec-skel";
      list.appendChild(row);
    }
  } else if (!members || members.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sec-mp-empty";
    empty.textContent = "No members resolved for this group.";
    list.appendChild(empty);
  } else {
    for (const m of members) {
      const childEntry = memberMaps[m.kind] && memberMaps[m.kind][String(m.id)];
      const nested = Boolean(isExpandableKind(m.kind) || (childEntry && childEntry.members && childEntry.members.length));
      const chip = document.createElement("div");
      chip.className = "sec-mp-chip" + (nested ? " sec-mp-expandable" : "");
      const label = resolveMemberLabel(m, memberMaps, lookups) || "Unnamed member";
      chip.textContent = label + (nested ? "  ›" : "");
      if (nested) {
        chip.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openMemberPopover(chip, resolveMemberLabel(m, memberMaps, lookups), m.kind, m.id, memberMaps, lookups);
        });
      }
      list.appendChild(chip);
    }
  }
  pop.appendChild(list);
}

function showMemberPopover(anchorEl) {
  const pop = getMemberPopoverEl();
  const rect = anchorEl.getBoundingClientRect();
  pop.classList.add("sec-member-visible");
  positionHoverPopover(pop, { x: rect.right, y: rect.top });
  if (!memberDismissListener) {
    memberDismissListener = (event) => {
      if (memberPopoverEl && memberPopoverEl.contains(event.target)) return;
      if (event.target && event.target.closest && event.target.closest(".sec-hp-expandable, .sec-mp-expandable")) return;
      hideMemberPopover();
    };
    document.addEventListener("mousedown", memberDismissListener, true);
  }
}

function openMemberPopover(anchorEl, title, kind, id, memberMaps, lookups) {
  const key = `${kind}:${id}`;
  if (memberOpenKey === key && memberPopoverEl && memberPopoverEl.classList.contains("sec-member-visible")) {
    hideMemberPopover();
    return;
  }
  memberOpenKey = key;
  const cached = memberMaps[kind] && memberMaps[kind][String(id)];
  const header = title || (cached && cached.name) || "Group members";
  const alreadyResolved = hasCachedMembers(memberMaps, kind, id);
  renderMemberPopover(header, cached && cached.members, memberMaps, lookups, !alreadyResolved);
  showMemberPopover(anchorEl);
  if (alreadyResolved) return;
  const seq = ++memberRequestSeq;
  requestMembers(kind, id, (response) => {
    if (seq !== memberRequestSeq || memberOpenKey !== key) return;
    const members = (response && response.members) || [];
    const resolvedName = resolveMemberLabel({ id, kind }, memberMaps, lookups);
    const name = title || resolvedName || (response && response.name) || header;
    if (!memberMaps[kind]) memberMaps[kind] = {};
    memberMaps[kind][String(id)] = { name, members };
    currentMemberMaps = memberMaps;
    renderMemberPopover(name, members, memberMaps, lookups, false);
    showMemberPopover(anchorEl);
  });
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

var hoverLookupsPromise = null;
function loadLookups() {
  if (!hoverLookupsPromise) {
    const extensionUrl = runtimeUrl("data/categories-lookup.json");
    if (!extensionUrl) return Promise.resolve({ categories: {}, apps: {}, protocols: {} });
    const base = extensionUrl.replace(/data\/categories-lookup\.json$/, "data/");
    hoverLookupsPromise = Promise.all([
      fetch(base + "categories-lookup.json").then((r) => r.json()).catch(() => ({})),
      fetch(base + "apps-lookup.json").then((r) => r.json()).catch(() => ({})),
      fetch(base + "protocols-lookup.json").then((r) => r.json()).catch(() => ({})),
    ]).then(([categories, apps, protocols]) => ({ categories, apps, protocols }));
  }
  return hoverLookupsPromise;
}

// Default fallback dictionary for identity types — mirrors popup-sections.js's
// DEFAULT_IDENTITY_TYPES. Used when the service worker hasn't resolved the
// org's identity types yet, so the hover popover can still show human-readable
// labels instead of raw numeric IDs.
var HOVER_DEFAULT_IDENTITY_TYPES = {
  "0": "Tags", "1": "Networks", "2": "Network Devices", "3": "AD Groups",
  "4": "Users & AD Groups", "5": "AD Computers", "6": "Internal Networks",
  "7": "AD Users", "8": "SAML Users & Groups", "9": "Roaming Computers",
  "10": "Device Posture Profiles", "11": "Security Group Tags (SGT)",
  "21": "Sites", "32": "Network Devices", "34": "Posture",
  "36": "Mobile Devices", "37": "OS Version & Patch Level",
  "38": "Chromebooks", "40": "Network Tunnels", "43": "G Suite Users",
  "45": "G Suite OUs", "50": "Endpoint Requirements",
  "52": "Catalyst SD-WAN Service VPN IDs", "54": "Security Group Tags",
  "57": "ZTNA Client",
  "user": "Active Directory Users & Groups", "device": "Network Devices",
  "site": "Sites & Branches", "group": "Users & AD Groups",
  "roaming": "Roaming Computers", "internal_network": "Internal Networks",
  "tunnel": "Network Tunnels", "saml": "SAML Users & Groups",
  "ip_subnet": "IP Subnets / CIDR", "posture": "Device Posture Profiles",
  "sgt": "Security Group Tags (SGT)",
};

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
    safeRuntimeMessage({ type: "GET_IDENTITY_MAP" }, (response) => {
      resolve(response && response.identityMap || {});
    });
  });
}

// Identity type map — live per-org data resolved by service-worker.js's
// resolveIdentityTypes() and cached in chrome.storage.local as
// sse_identity_type_map. Merged with HOVER_DEFAULT_IDENTITY_TYPES for
// fallback labels (same pattern as popup-sections.js's DEFAULT_IDENTITY_TYPES
// merge). Fetched per-hover like loadIdentityMap() — cheap storage read.
function loadIdentityTypeMap() {
  return new Promise((resolve) => {
    safeRuntimeMessage({ type: "GET_IDENTITY_TYPE_MAP" }, (response) => {
      resolve(response && response.identityTypeMap || {});
    });
  });
}

// Same live per-org pattern as loadIdentityMap() above, but for
// private_resource_ids/private_resource_group_ids — resolved by
// service-worker.js's resolveObjectRefs() and cached separately (different
// ID space, see popup.js's currentObjectMap comment).
function loadObjectMap() {
  return new Promise((resolve) => {
    safeRuntimeMessage({ type: "GET_OBJECT_MAP" }, (response) => {
      if (!response) {
        resolve({ objectMap: {}, objectMaps: {} });
        return;
      }
      resolve({ objectMap: response.objectMap || {}, objectMaps: response.objectMaps || {} });
    });
  });
}

// Group/list membership resolved by service-worker.js's resolveMembership()
// and cached in chrome.storage.local as sse_member_maps — powers the
// recursive "expand this source/destination" popover. Re-fetched per hover
// (cheap storage read); empty until at least one membership fetch has run.
function loadMemberMaps() {
  return new Promise((resolve) => {
    safeRuntimeMessage({ type: "GET_MEMBER_MAP" }, (response) => {
      resolve(response && response.memberMaps ? response.memberMaps : {});
    });
  });
}

// Maps a source/destination condition attributeName to the membership map key
// whose members should be expandable in the popover. Only group/list types
// are expandable; leaf conditions (identities, IPs, single apps) are not.
var MEMBER_CONDITION_KIND = {
  identityGroups: true,
  networkObjectGroups: true,
  serviceObjectGroups: true,
  destinationLists: true,
  applicationLists: true,
  categoryLists: true,
  privateResourceGroups: true,
};

var MEMBER_CONDITION_MAP = {
  "umbrella.source.networkobjectgroupids": "networkObjectGroups",
  "umbrella.source.networkobjectgroupids_shared": "networkObjectGroups",
  "umbrella.destination.networkobjectgroupids": "networkObjectGroups",
  "umbrella.destination.serviceobjectgroupids": "serviceObjectGroups",
  "umbrella.destination.destination_list_ids": "destinationLists",
  "umbrella.destination.application_list_ids": "applicationLists",
  "umbrella.destination.category_list_ids": "categoryLists",
  "umbrella.destination.private_resource_group_ids": "privateResourceGroups",
  "umbrella.source.identity_ids": "identityGroups",
  "umbrella.source.identity_ids_shared": "identityGroups",
};

var IDENTITY_GROUP_TYPE_IDS = {
  "3": true, "4": true, "8": true, "11": true, "40": true, "45": true, "54": true,
};

function conditionKindFor(attributeName) {
  const attr = String(attributeName || "").toLowerCase();
  if (MEMBER_CONDITION_MAP[attr]) return MEMBER_CONDITION_MAP[attr];
  if (attr.includes("private_resource_group")) return "privateResourceGroups";
  if (attr.includes("networkobjectgroup")) return "networkObjectGroups";
  if (attr.includes("serviceobjectgroup")) return "serviceObjectGroups";
  if (attr.includes("destination_list")) return "destinationLists";
  if (attr.includes("application_list")) return "applicationLists";
  if (attr.includes("category_list")) return "categoryLists";
  if (attr.includes("identity_ids") || attr.includes("identity_group")) return "identityGroups";
  return null;
}

function isIdentityGroupId(id, lookups) {
  const sid = String(id);
  const typeId = lookups && lookups.sourceIdentityTypeIds && lookups.sourceIdentityTypeIds[sid];
  if (typeId !== undefined && typeId !== null) return Boolean(IDENTITY_GROUP_TYPE_IDS[String(typeId)]);
  // Fail closed: a named AD user / roaming computer / device is a leaf.
  // Only expand when we know this id is a group type.
  return false;
}

// Returns expandable member descriptors for a condition, or null if the
// condition is not a group/list type. Each descriptor: { id, kind, label }.
// Names come from membership data first, then already-loaded catalogs.
function expansionForCondition(cond, memberMaps, lookups) {
  if (!cond || !cond.raw || !cond.raw.attributeName) return null;
  const key = conditionKindFor(cond.raw.attributeName);
  if (!key) return null;
  const av = Array.isArray(cond.raw.attributeValue) ? cond.raw.attributeValue : [cond.raw.attributeValue];
  const byId = {};
  for (const id of av) {
    if (id === undefined || id === null || id === "*" || String(id).toLowerCase() === "any") continue;
    const sid = String(id);
    if (key === "identityGroups" && !isIdentityGroupId(sid, lookups)) continue;
    const label = resolveMemberLabel({ id: sid, kind: key }, memberMaps || {}, lookups || {});
    byId[sid] = { id: sid, kind: key, label };
  }
  return Object.keys(byId).length ? byId : null;
}

function summarizeConditions(rule, lookups) {
  const objectMaps = lookups.objectMaps || {};
  const objectName = (map, id, fallback) => {
    const raw = map && map[String(id)];
    if (typeof raw === "string" && raw) return raw;
    if (raw && typeof raw === "object") return raw.name || raw.label || raw.displayName || fallback;
    return fallback;
  };
  const networkObjects = objectMaps.networkObjects || {};
  const networkObjectGroups = objectMaps.networkObjectGroups || {};
  const serviceObjects = objectMaps.serviceObjects || {};
  const serviceObjectGroups = objectMaps.serviceObjectGroups || {};
  const destinationLists = objectMaps.destinationLists || {};
  const applicationLists = objectMaps.applicationLists || {};
  const categoryLists = objectMaps.categoryLists || {};
  const geolocations = objectMaps.geolocations || {};
  const postureProfiles = objectMaps.postureProfiles || {};
  const privateResources = objectMaps.privateResources || lookups.objects || {};
  const privateResourceGroups = objectMaps.privateResourceGroups || {};
  const countryName = (code) => {
    if (typeof code !== "string" || !/^[A-Za-z]{2}$/.test(code)) return String(code);
    try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code; }
    catch (_) { return code; }
  };
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
        const mergedTypes = Object.assign({}, HOVER_DEFAULT_IDENTITY_TYPES, lookups.identityTypes || {});
        const identityNames = (Array.isArray(values) ? values : [values]).map((id) => {
          const raw = lookups.identities && (lookups.identities[String(id)] !== undefined ? lookups.identities[String(id)] : lookups.identities[id]);
          const name = typeof raw === "string" ? raw : (raw && (raw.name || raw.label || raw.displayName)) || "";
          const typeId = lookups.sourceIdentityTypeIds && lookups.sourceIdentityTypeIds[String(id)];
          const type = typeId !== undefined ? (mergedTypes[String(typeId)] || `Type ${typeId}`) : null;
          const label = name || "Deleted identity";
          return type ? `${label} (${type})` : label;
        });
        summaryText = `Source Identities: ${identityNames.join(", ")}`;
        break;
      }
      case "umbrella.source.identity_type_ids":
      case "umbrella.source.identity_type_ids_shared": {
        // Resolve identity type IDs to human-readable labels using the
        // live identityTypeMap from the service worker, with
        // HOVER_DEFAULT_IDENTITY_TYPES as fallback (same pattern as
        // popup-sections.js's DEFAULT_IDENTITY_TYPES merge).
        const mergedTypes = Object.assign({}, HOVER_DEFAULT_IDENTITY_TYPES, lookups.identityTypes || {});
        const typeNames = (Array.isArray(values) ? values : [values]).map((id) => {
          return mergedTypes[String(id)] || mergedTypes[id] || "Identity Type";
        });
        summaryText = `Identity Type: ${typeNames.join(", ")}`;
        break;
      }
      case "umbrella.destination.application_category_ids":
      case "umbrella.destination.category_ids": // alias — same concept, different field name per org (see matcher.js)
        // values here are bitfieldPosition, not categoryId — categories-lookup.json
        // is keyed by bitfieldPosition for exactly this reason (see data/categories-lookup.json).
        const catNames = Array.isArray(values) ? values.map((id) => {
          const entry = lookups.categories[id];
          if (!entry) return "Content Category";
          return typeof entry === "object" ? (entry.name || entry.label || "Content Category") : entry;
        }) : [];
        summaryText = `App Categories: ${catNames.length ? catNames.join(", ") : "Content Categories"}`;
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
        if (unresolved.length) parts.push(`Applications: ${unresolved.map(() => "Internet Application").join(", ")}`);
        summaryText = parts.length ? parts.join(" ; ") : "Applications: Configured Apps";
        break;
      }
      case "umbrella.destination.composite_inline_ip": {
        const items = Array.isArray(values) ? values : [values];
        const parts = items.map((item) => {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const ip = Array.isArray(item.ip) ? item.ip.join(", ") : (item.ip || "*");
            const port = Array.isArray(item.port) ? item.port.join(", ") : (item.port || "*");
            const proto = item.protocol || "ANY";
            return `IP: ${ip}, Port: ${port}, Protocol: ${proto}`;
          }
          return String(item);
        });
        summaryText = `IP/Port/Protocol: ${parts.join(" + ")}`;
        break;
      }
      case "umbrella.destination.destination_list_ids": {
        const names = (Array.isArray(values) ? values : [values]).map((id) =>
          objectName(destinationLists, id, `Unresolved Destination List (${id})`));
        summaryText = `Destination List: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.application_list_ids": {
        const names = (Array.isArray(values) ? values : [values]).map((id) =>
          objectName(applicationLists, id, `Unresolved Application List (${id})`));
        summaryText = `Application List: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.category_list_ids": {
        const names = (Array.isArray(values) ? values : [values]).map((id) =>
          objectName(categoryLists, id, `Unresolved Category List (${id})`));
        summaryText = `Category List: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.geolocations": {
        const names = (Array.isArray(values) ? values : [values]).map((code) =>
          objectName(geolocations, code, countryName(code)));
        summaryText = `Countries: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.appRiskProfileId": {
        const ids = Array.isArray(values) ? values : [values];
        const names = ids.map((id) => {
          const name = lookups.appRiskProfiles && lookups.appRiskProfiles[String(id)];
          return name || "App Risk Profile";
        });
        summaryText = ids.length === 1
          ? `App Risk Profile: ${names[0]}`
          : `App Risk Profiles: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.private_resource_types": {
        const items = Array.isArray(values) ? values : [values];
        const labels = items.map((v) => {
          if (v === "apps") return "Applications";
          if (v === "networks") return "Networks";
          if (v === "websites") return "Websites";
          return String(v).charAt(0).toUpperCase() + String(v).slice(1);
        });
        summaryText = `Resource Types: ${labels.join(", ")}`;
        break;
      }
      case "umbrella.destination.private_resource_ids":
      case "umbrella.destination.private_resource_group_ids": {
        const isGroup = type.endsWith("_group_ids");
        const label = isGroup ? "Private Resource Groups" : "Private Resources";
        const map = isGroup ? privateResourceGroups : privateResources;
        const resNames = (Array.isArray(values) ? values : [values]).map((id) =>
          objectName(map, id, `Unresolved ${isGroup ? "Private Resource Group" : "Private Resource"} (${id})`));
        summaryText = `${label}: ${resNames.join(", ")}`;
        break;
      }
      case "umbrella.source.networkObjectIds":
      case "umbrella.source.networkObjectIds_shared": {
        const ids = Array.isArray(values) ? values : [values];
        const names = ids.map((id) => objectName(networkObjects, id, `Unresolved Network Object (${id})`));
        summaryText = `Source Network Objects: ${names.join(", ")}`;
        break;
      }
      case "umbrella.source.networkObjectGroupIds":
      case "umbrella.source.networkObjectGroupIds_shared": {
        const ids = Array.isArray(values) ? values : [values];
        const names = ids.map((id) => objectName(networkObjectGroups, id, `Unresolved Network Object Group (${id})`));
        summaryText = `Source Network Object Groups: ${names.join(", ")}`;
        break;
      }
      case "umbrella.source.geolocations": {
        const geos = Array.isArray(values) ? values : [values];
        const names = geos.map((g) => {
          if (!g || typeof g !== "string" || g.length !== 2 || !/^[A-Za-z]{2}$/.test(g)) return g;
          try {
            return new Intl.DisplayNames(["en"], { type: "region" }).of(g.toUpperCase()) || g;
          } catch {
            return g;
          }
        });
        summaryText = `Source Countries: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.networkObjectGroupIds": {
        const ids = Array.isArray(values) ? values : [values];
        const names = ids.map((id) => objectName(networkObjectGroups, id, `Unresolved Network Object Group (${id})`));
        summaryText = `Destination Network Object Groups: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.networkObjectIds": {
        const ids = Array.isArray(values) ? values : [values];
        const names = ids.map((id) => objectName(networkObjects, id, `Unresolved Network Object (${id})`));
        summaryText = `Destination Network Objects: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.serviceObjectIds": {
        const ids = Array.isArray(values) ? values : [values];
        const names = ids.map((id) => objectName(serviceObjects, id, `Unresolved Service Object (${id})`));
        summaryText = `Service Objects: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.serviceObjectGroupIds": {
        const ids = Array.isArray(values) ? values : [values];
        const names = ids.map((id) => objectName(serviceObjectGroups, id, `Unresolved Service Object Group (${id})`));
        summaryText = `Service Object Groups: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.application_category_ids": {
        const ids = Array.isArray(values) ? values : [values];
        const names = ids.map((id) => {
          const entry = lookups.categories && lookups.categories[id];
          return typeof entry === "object" ? (entry.name || entry.label || `Unresolved Application Category (${id})`) : (entry || `Unresolved Application Category (${id})`);
        });
        summaryText = `Application Categories: ${names.join(", ")}`;
        break;
      }
      case "umbrella.destination.saasTenantIds": {
        const ids = Array.isArray(values) ? values : [values];
        summaryText = `SaaS Tenant Controls: ${ids.join(", ")}`;
        break;
      }
      case "umbrella.destination.security_group_tag_ids":
      case "umbrella.destination.any_security_group_tag": {
        const ids = Array.isArray(values) ? values : [values];
        summaryText = `Security Group Tags (SGT): ${ids.join(", ")}`;
        break;
      }
      case "umbrella.posture.ipsProfileId": {
        const ids = Array.isArray(values) ? values : [values];
        const names = ids.map((id) => objectName(postureProfiles, id, `Unresolved IPS Profile (${id})`));
        summaryText = `IPS Profile: ${names.join(", ")}`;
        break;
      }
      case "umbrella.posture.profileIdClientbased":
      case "umbrella.posture.profileIdClientless":
      case "umbrella.posture.vpnProfileId":
      case "umbrella.posture.webProfileId": {
        const ids = Array.isArray(values) ? values : [values];
        const label = type.replace("umbrella.posture.", "").replace(/([A-Z])/g, " $1");
        const names = ids.map((id) => objectName(postureProfiles, id, `Unresolved Posture Profile (${id})`));
        summaryText = `Posture (${label}): ${names.join(", ")}`;
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
    if (typeof reason === "object" && reason !== null) {
      // Object-style condition: render as chips like rules tab
      if (reason.condition) {
        const keyEl = document.createElement("span");
        keyEl.className = "sec-hp-match-key";
        keyEl.textContent = reason.condition + ":";
        row.appendChild(keyEl);
      }
      const valParts = [];
      if (reason.value) valParts.push(reason.value);
      if (reason.operator) valParts.push("(" + reason.operator + ")");
      if (reason.action) valParts.push("→ " + reason.action);
      if (valParts.length > 0) {
        const valEl = document.createElement("span");
        valEl.className = "sec-hp-match-val";
        valEl.textContent = " " + valParts.join(" ");
        row.appendChild(valEl);
      } else {
        row.appendChild(document.createTextNode(JSON.stringify(reason)));
      }
    } else {
      row.textContent = String(reason);
    }
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
}

function hoverSideForAnchor(anchorEl) {
  if (!anchorEl || !anchorEl.closest) return "all";
  if (anchorEl.closest('[data-testid="policy-source-column"]')) return "source";
  if (anchorEl.closest('[data-testid="policy-destination-item"]')) return "destination";
  const cell = anchorEl.closest("td");
  const row = anchorEl.closest("tr");
  const table = row && row.closest("table");
  if (!cell || !row || !table) return "all";
  const headers = Array.from(table.querySelectorAll("thead th, thead [role='columnheader']"));
  const index = Array.from(row.children).indexOf(cell);
  const headerText = ((headers[index] && (headers[index].innerText || headers[index].textContent)) || "").trim().toLowerCase();
  if (/^source/.test(headerText) || index === 2) return "source";
  if (/^dest/.test(headerText) || index === 3) return "destination";
  return "all";
}

function renderHoverPopoverContent(popover, ruleName, rule, findings, matchSummary, testMatchReasons, hoverSide) {
  hideMemberPopover();
  popover.innerHTML = "";

  // Set data-action for left border accent color (matches rules tab cards)
  if (rule && rule.action) {
    popover.setAttribute("data-action", (rule.action || "").toLowerCase());
  } else if (testMatchReasons && testMatchReasons.length > 0 && testMatchReasons[0].action) {
    popover.setAttribute("data-action", testMatchReasons[0].action.toLowerCase());
  } else {
    popover.removeAttribute("data-action");
  }

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

  // --- Top line: action pill + priority (matches rules tab psc-rule-top-line) ---
  const meta = document.createElement("div");
  meta.className = "sec-hp-meta";

  const action = (rule.action || "unknown").toLowerCase();
  const actionBadge = document.createElement("span");
  actionBadge.className = `sec-hp-action sec-hp-action-${["allow", "block", "isolate"].includes(action) ? action : "unknown"}`;
  actionBadge.textContent = action.toUpperCase();
  meta.appendChild(actionBadge);

  const priorityValue = rule.rulePriority !== undefined ? rule.rulePriority : rule.order;
  if (priorityValue !== undefined && priorityValue !== null) {
    const priority = document.createElement("span");
    priority.className = "sec-hp-priority";
    priority.textContent = `Priority #${priorityValue}`;
    meta.appendChild(priority);
  }
  if (rule.trafficScope || rule.ruleAccess || (rule.raw && rule.raw.ruleAccess)) {
    const scope = rule.trafficScope || rule.ruleAccess || rule.raw.ruleAccess;
    const scopeEl = document.createElement("span");
    scopeEl.className = "sec-hp-priority";
    scopeEl.textContent = scope === "private_network" ? "Private Access" : "Internet";
    meta.appendChild(scopeEl);
  }
  if (rule.is_default) {
    const priority = document.createElement("span");
    priority.className = "sec-hp-priority";
    priority.textContent = "Default rule (always evaluated last)";
    meta.appendChild(priority);
  }

  body.appendChild(meta);

  // --- Findings / Audit Feedback section ---
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
      row.appendChild(document.createTextNode(f.message));
      findingsWrap.appendChild(row);
    }
  }
  body.appendChild(findingsWrap);

  const sourceConditions = (matchSummary || []).filter(item => /^umbrella\.source\./.test(item.raw && item.raw.attributeName || ""));
  const destinationConditions = (matchSummary || []).filter(item => /^umbrella\.destination\./.test(item.raw && item.raw.attributeName || ""));
  const postureConditions = (matchSummary || []).filter(item => /^umbrella\.posture\./.test(item.raw && item.raw.attributeName || ""));
  const conditionDisplayLines = (condition) => {
    const attribute = (condition.raw && condition.raw.attributeName || "").toLowerCase();
    const text = condition.text || "";
    const colon = text.indexOf(":");
    const value = (colon >= 0 ? text.slice(colon + 1) : text).trim();
    if (attribute === "umbrella.source.all") return ["Any source"];
    if (attribute === "umbrella.destination.all") return ["Any destination"];
    // Type-only source conditions are policy scope, not a selectable person
    // or device. Keep that distinction explicit in the hover card.
    if (attribute.includes("identity_type")) {
      return value.split(", ").map(part => `Any ${part.trim()}`).filter(Boolean);
    }
    const typeLabel =
      attribute.includes("private_resource_group") ? "Private Resource Group" :
      attribute.includes("private_resource") ? "Private Resource" :
      attribute.includes("destination_list") ? "Destination List" :
      attribute.includes("application_list") ? "Application List" :
      attribute.includes("category_list") ? "Category List" :
      attribute.includes("application_category") ? "Application Category" :
      attribute.includes("category_ids") ? "Content Category" :
      attribute.includes("application_ids") ? "Application" :
      attribute.includes("networkobjectgroup") ? "Network Object Group" :
      attribute.includes("networkobject") ? "Network Object" :
      attribute.includes("serviceobjectgroup") ? "Service Object Group" :
      attribute.includes("appriskprofileid") ? "App Risk Profile" :
      attribute.includes("security_group_tag") ? "SGT" :
      attribute.includes("saastenant") ? "SaaS Tenant" :
      attribute.includes("geolocations") ? "Country" :
      attribute.includes("posture.") ? "Posture Profile" :
      "";
    // A condition can contain several selected catalog entries. Render each
    // as an individual fact, not a dense comma-separated field-value label.
    const values = value.split(" ; ").flatMap(part =>
      Array.isArray(condition.raw && condition.raw.attributeValue) && condition.raw.attributeValue.length > 1
        ? part.split(", ")
        : [part]
    ).map(part => part.trim()).filter(Boolean);
    return values.map(part => {
      if (!typeLabel || /\([^)]*\)$/.test(part)) return part;
      return `${part} (${typeLabel})`;
    });
  };

  const renderConditionGroup = (title, items) => {
    if (!items.length) return;
    const section = document.createElement("div");
    section.className = "sec-hp-section";
    section.textContent = title;
    body.appendChild(section);
    const chipsWrap = document.createElement("div");
    chipsWrap.className = "sec-hp-chips sec-hp-condition-list";
    for (const cs of items) {
      const expandableById = expansionForCondition(cs, currentMemberMaps, currentLookups) || {};
      const lines = conditionDisplayLines(cs);
      const ids = Array.isArray(cs.raw && cs.raw.attributeValue)
        ? cs.raw.attributeValue.map(String)
        : (cs.raw && cs.raw.attributeValue !== undefined ? [String(cs.raw.attributeValue)] : []);
      const count = Math.max(lines.length, ids.length);
      for (let i = 0; i < count; i++) {
        const item = expandableById[ids[i]] || null;
        const line = lines[i] || (item && item.label);
        if (!line) continue;
        const chip = document.createElement("span");
        chip.className = "sec-hp-chip" + (item ? " sec-hp-expandable" : "");
        chip.textContent = line + (item ? "  ▾" : "");
        if (item) {
          chip.title = "Click to expand members";
          chip.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearTimeout(hoverHideTimer);
            openMemberPopover(chip, line, item.kind, item.id, currentMemberMaps, currentLookups);
          });
        }
        chipsWrap.appendChild(chip);
      }
    }
    body.appendChild(chipsWrap);
  };
  const side = hoverSide === "source" || hoverSide === "destination" ? hoverSide : "all";
  if (side !== "destination") renderConditionGroup("Source", sourceConditions);
  if (side !== "source") renderConditionGroup("Destination", destinationConditions);
  if (side === "all") renderConditionGroup("Posture / Security Profile", postureConditions);

  // --- Security profile chips (IPS, AMP, TLS, DLP) ---
  if (rule.security_profiles) {
    const sp = rule.security_profiles;
    const spWrap = document.createElement("div");
    spWrap.className = "sec-hp-chips";
    var spItems = [
      { label: "IPS", on: sp.ips_enabled },
      { label: "AMP", on: sp.amp_malware_enabled },
      { label: "TLS", on: sp.tls_decryption_enabled },
      { label: "DLP", on: sp.dlp_enabled }
    ];
    for (var i = 0; i < spItems.length; i++) {
      var s = spItems[i];
      if (s.on === undefined) continue;
      var chip = document.createElement("span");
      chip.className = "sec-hp-chip";
      chip.style.background = s.on ? "#f0fdf4" : "#f8fafc";
      chip.style.borderColor = s.on ? "#bbf7d0" : "#cbd5e1";
      chip.style.color = s.on ? "#166534" : "#64748b";
      chip.style.fontWeight = s.on ? "700" : "500";
      chip.textContent = s.label + ": " + (s.on ? "ON" : "OFF");
      spWrap.appendChild(chip);
    }
    if (spWrap.children.length > 0) body.appendChild(spWrap);
  }

  // --- Why your test matched this rule ---
  if (hasReasons) {
    appendMatchReasonSection(body, testMatchReasons);
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

  safeRuntimeMessage({ type: "GET_RULES" }, (response) => {
    rules = (response && response.rules) || [];
    maybeDone();
  });
  safeRuntimeMessage({ type: "GET_FINDINGS" }, (response) => {
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
  const isTriggered = Array.isArray(testMatchReasons) && testMatchReasons.length > 0;
  const hoverSide = isTriggered ? "all" : hoverSideForAnchor(anchorEl);

  // Clean up any previous triggered-dismiss listener
  if (triggeredDismissListener) {
    document.removeEventListener("mousedown", triggeredDismissListener, true);
    triggeredDismissListener = null;
  }

  function renderHoverSkeleton() {
    popover.innerHTML = "";
    const header = document.createElement("div");
    header.className = "sec-hp-header";
    header.textContent = ruleName;
    popover.appendChild(header);
    const body = document.createElement("div");
    body.className = "sec-hp-body";
    const title = document.createElement("div");
    title.className = "sec-hp-skel-title sec-skel";
    body.appendChild(title);
    for (let i = 0; i < 5; i++) {
      const row = document.createElement("div");
      row.className = "sec-hp-skel sec-skel";
      body.appendChild(row);
    }
    popover.appendChild(body);
  }

  function reveal() {
    popover.classList.add("sec-hover-visible");
    // Keep the native cursor beside the card rather than anchoring to the
    // complete table-row rectangle, which can be far from where the user is
    // reading. Triggered popovers still use their highlight row rectangle.
    const anchor = isTriggered
      ? { x: anchorRect.left, y: anchorRect.bottom }
      : (hoverPointer || { x: anchorRect.left, y: anchorRect.bottom });
    positionHoverPopover(popover, anchor);
    if (isTriggered) {
      // Triggered popover: stays open until user clicks outside
      triggeredDismissListener = (e) => {
        // Ignore clicks inside the popover or on the highlighted row
        if (popover.contains(e.target)) return;
        if (currentHighlightEl && currentHighlightEl.contains(e.target)) return;
        // Dismiss
        popover.classList.remove("sec-hover-visible");
        if (currentHighlightEl) {
          currentHighlightEl.classList.remove("sec-highlight");
          currentHighlightEl = null;
        }
        document.removeEventListener("mousedown", triggeredDismissListener, true);
        triggeredDismissListener = null;
      };
      document.addEventListener("mousedown", triggeredDismissListener, true);
    } else if (autoHideMs !== undefined) {
      scheduleHideHoverPopover(autoHideMs);
    }
  }

  // For triggered (simulation) popovers: show immediately with match reasons,
  // then enrich with rules/findings data if it arrives in time.
  if (isTriggered) {
    renderHoverPopoverContent(popover, ruleName, null, null, null, testMatchReasons, hoverSide);
    reveal();
  } else {
    renderHoverSkeleton();
    reveal();
  }

  loadRulesAndFindings((rules, findings) => {
    // Enrich the already-visible popover with rule details if available
    const lowerName = ruleName.toLowerCase();
    const rule = rules.find(r => (r.name || "").trim().toLowerCase() === lowerName);
    const ruleFindings = findings.filter(f => f.ruleName.trim().toLowerCase() === lowerName);

    if (rule || ruleFindings.length > 0) {
      renderHoverPopoverContent(popover, ruleName, rule, ruleFindings, null, testMatchReasons, hoverSide);
      // Keep the native cursor beside the card rather than anchoring to the
      // complete table-row rectangle, which can be far from where the user is
      // reading. Triggered popovers still use their highlight row rectangle.
      const anchor = isTriggered
        ? { x: anchorRect.left, y: anchorRect.bottom }
        : (hoverPointer || { x: anchorRect.left, y: anchorRect.bottom });
      positionHoverPopover(popover, anchor);
    }

    if (!isTriggered) {
      // Hover-only: only show after data loads
      if (rules.length === 0 && findings.length === 0) {
        renderHoverPopoverContent(popover, ruleName, null, null, null, testMatchReasons, hoverSide);
        reveal();
        return;
      }

      if (!rule) {
        renderHoverPopoverContent(popover, ruleName, null, ruleFindings, null, testMatchReasons, hoverSide);
        reveal();
        return;
      }
    }

    // Match summary needs the lookup JSONs (categories/apps/protocols) plus
    // the live identityMap, identityTypeMap, and objectMap — fetched lazily,
    // see loadLookups()/loadIdentityMap()/loadIdentityTypeMap()/loadObjectMap()
    // above. Still fetched even when testMatchReasons is provided, in case
    // some future caller wants both sections; renderHoverPopoverContent() itself
    // decides which one to actually show.
    Promise.all([loadLookups(), loadIdentityMap(), loadIdentityTypeMap(), loadObjectMap(), loadMemberMaps()]).then(([lookups, identityMap, identityTypeMap, objectMapResult, memberMaps]) => {
      lookups.identities = identityMap;
      lookups.identityTypes = Object.assign({}, HOVER_DEFAULT_IDENTITY_TYPES, identityTypeMap);
      const om = objectMapResult.objectMaps || {};
      lookups.sourceIdentityTypeIds = om.sourceIdentityTypeIds || {};
      lookups.objects = objectMapResult.objectMap || objectMapResult;
      lookups.objectMaps = om;
      // Wire typed object maps for lookups (appRiskProfiles, etc.)
      lookups.appRiskProfiles = om.appRiskProfiles || {};
      lookups.postureProfiles = om.postureProfiles || {};
      lookups.geolocations = om.geolocations || {};
      lookups.memberMaps = memberMaps || {};
      currentMemberMaps = memberMaps || {};
      currentLookups = lookups;
      const matchSummary = summarizeConditions(rule, lookups);
      renderHoverPopoverContent(popover, ruleName, rule, ruleFindings, matchSummary, testMatchReasons, hoverSide);
      reveal();
    });
  });
}

function policyConditionCells() {
  // Cisco has changed the inner markup of these cells across dashboard builds,
  // so test IDs alone are not reliable. Resolve the Source/Destination column
  // indices from each table's visible headers and bind the corresponding cells.
  const cells = new Set(document.querySelectorAll(CHIP_SELECTOR));
  const rows = [...findRuleRows(), ...findDefaultRuleRows()];
  for (const row of rows) {
    const table = row.closest("table");
    if (!table) continue;
    const headerNodes = Array.from(table.querySelectorAll("thead th, thead [role='columnheader']"));
    const indices = headerNodes
      .map((header, index) => ({ index, text: (header.innerText || header.textContent || "").trim().toLowerCase() }))
      .filter(({ text }) => /^(source|sources|destination|destinations)$/.test(text))
      .map(({ index }) => index);
    const rowCells = row.querySelectorAll(":scope > td");
    // Current Cisco policy tables render Priority, Rule Name, Source and
    // Destination in cells 0–3. If a dashboard build hides its semantic
    // header markup, retain this observed column-position fallback.
    const candidateIndices = indices.length ? indices : [2, 3];
    for (const index of candidateIndices) {
      if (rowCells[index]) cells.add(rowCells[index]);
    }
  }
  return cells;
}

function handlePolicyColumnMouseEnter(event) {
  const target = event.currentTarget;
  clearTimeout(hoverHideTimer);
  hoverPointer = { x: event.clientX, y: event.clientY };
  const row = target.closest("tr");
  if (!row) return;
  const ruleName = getRuleName(row);
  if (ruleName && ruleName !== "unknown") showPopoverForRule(target, ruleName, null, undefined);
}

function handlePolicyColumnMouseLeave(event) {
  const target = event.currentTarget;
  const related = event.relatedTarget;
  if (related && target.contains(related)) return;
  scheduleHideHoverPopover();
}

function attachChipListeners() {
  // Bind directly to the live Cisco source-column and destination-item nodes.
  // The mutation observer below attaches handlers to replacement nodes after
  // the dashboard virtualizes, filters, or re-sorts its rule rows.
  const targets = document.querySelectorAll(CHIP_SELECTOR);
  for (const target of targets) {
    if (attachedChips.has(target)) continue;
    attachedChips.add(target);
    target.addEventListener("mouseenter", handlePolicyColumnMouseEnter);
    target.addEventListener("mouseleave", handlePolicyColumnMouseLeave);
  }
}

function initHoverPopover() {
  attachChipListeners();

  // Cisco replaces these source/destination nodes when the virtualized table
  // sorts, filters, or pages; bind handlers to each new live node.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(attachChipListeners, 150);
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
var EMBED_PANEL_WIDTH = 680;
var EMBED_PANEL_HEIGHT = 480;

function ensureEmbeddedPopupStyle() {
  const oldStyle = document.getElementById("sec-embed-popup-style");
  if (oldStyle) oldStyle.remove();
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
      background: #0f172a !important;
      color: #ffffff !important;
      border: 1px solid #1e293b !important;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.25) !important;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s ease, background 0.15s ease;
      padding: 0;
    }
    #sec-embed-toggle:hover {
      background: #1e293b !important;
      transform: scale(1.05);
    }

    /* Full-height right side drawer panel design */
    #sec-embed-panel {
      position: fixed;
      top: 0;
      bottom: 0;
      right: 0;
      width: min(680px, 100vw);
      height: 100vh;
      max-width: 100vw;
      background: #ffffff;
      border-left: 1px solid #cbd5e1;
      box-shadow: -10px 0 30px rgba(15, 23, 42, 0.15);
      overflow-x: hidden;
      overflow-y: hidden;
      z-index: 2147483646;
      display: block;
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #sec-embed-panel.sec-embed-open {
      transform: translateX(0);
    }

    #sec-embed-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      background: transparent;
      overflow-x: hidden;
    }
  `;
  document.head.appendChild(style);
}

function initEmbeddedPopup() {
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", initEmbeddedPopup);
    return;
  }
  const oldBtn = document.getElementById("sec-embed-toggle");
  if (oldBtn) oldBtn.remove();
  const oldPanel = document.getElementById("sec-embed-panel");
  if (oldPanel) oldPanel.remove();

  ensureEmbeddedPopupStyle();

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "sec-embed-toggle";
  toggleBtn.title = "Secure Access Policy Checker";
  toggleBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L3 6V11.5C3 16.8 6.8 21.5 12 22.8C17.2 21.5 21 16.8 21 11.5V6L12 2Z" fill="#0F172A" stroke="#0F172A" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M8.5 12L11 14.5L16 9.5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const panel = document.createElement("div");
  panel.id = "sec-embed-panel";

  // Loading the extension's own popup.html as an iframe src requires it (and
  // everything it loads: popup.js, popup-sections.js, matcher.js,
  // and the data/*.json lookups fetched at runtime) to be listed in
  // manifest.json's web_accessible_resources — see manifest.json.
  const iframe = document.createElement("iframe");
  iframe.id = "sec-embed-iframe";
  iframe.style.overflowX = "hidden";
  
  // Extract orgId from URL and pass it directly in the iframe src
  // This is more reliable than the postMessage handshake
  const orgMatch = window.location.href.match(/\/org\/(\d+)/);
  const orgId = orgMatch ? orgMatch[1] : null;
  const iframeSrcBase = runtimeUrl("popup/popup.html");
  if (!iframeSrcBase) return;
  const iframeSrc = iframeSrcBase + (orgId ? `?orgId=${orgId}` : "");
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
  if (orgId && api && api.storage && api.storage.local) {
    try { api.storage.local.set({ cached_org_id: orgId }); } catch (_) {}
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
// ---------------------------------------------------------------------------
// Run on page load & watch SPA route re-hydration
// ---------------------------------------------------------------------------

function isSecurePolicyPage(url) {
  try {
    const parsed = new URL(url || window.location.href);
    if (parsed.hostname.toLowerCase() !== "dashboard.sse.cisco.com") return false;
    return /\/secure\/policy(?:\/|$|\?|#)/.test(parsed.pathname);
  } catch (_) {
    return false;
  }
}

function teardownPolicyCheckerUi() {
  hideMemberPopover();
  hideHoverPopover();
  const toggleBtn = document.getElementById("sec-embed-toggle");
  if (toggleBtn) toggleBtn.remove();
  const panel = document.getElementById("sec-embed-panel");
  if (panel) panel.remove();
}

function syncPolicyCheckerUi() {
  if (!isSecurePolicyPage()) {
    teardownPolicyCheckerUi();
    return;
  }
  initHoverPopover();
  if (!document.getElementById("sec-embed-toggle") || !document.getElementById("sec-embed-panel")) {
    initEmbeddedPopup();
  }
}

function setupPersistence() {
  syncPolicyCheckerUi();

  // Listen for messages from the popup (toolbar or embedded panel).
  // The popup sends HIGHLIGHT_RULE via chrome.tabs.sendMessage() after a
  // successful "Run Simulation" — this listener routes it to highlightRule().
  if (api && api.runtime && api.runtime.id && !window.__secPolicyCheckerMessages) {
    window.__secPolicyCheckerMessages = true;
    api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === "HIGHLIGHT_RULE") {
        if (!isSecurePolicyPage()) {
          sendResponse({ ok: false, reason: "not-policy-page" });
          return;
        }
        highlightRule(msg.ruleName, msg.matchedConditions);
        sendResponse({ ok: true });
      }
    });
  }

  // Cisco's dashboard is an SPA. Re-check when the route or body children
  // change so the checker appears only on /secure/policy and is torn down
  // everywhere else.
  if (!window.__secPolicyCheckerRouteWatch) {
    window.__secPolicyCheckerRouteWatch = true;
    window.addEventListener("popstate", syncPolicyCheckerUi);
    window.addEventListener("hashchange", syncPolicyCheckerUi);
    ["pushState", "replaceState"].forEach((method) => {
      const original = history[method];
      if (typeof original !== "function") return;
      history[method] = function () {
        const result = original.apply(this, arguments);
        queueMicrotask(syncPolicyCheckerUi);
        return result;
      };
    });
    if (window.MutationObserver && document.documentElement) {
      let debounceTimer = null;
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(syncPolicyCheckerUi, 150);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupPersistence);
} else {
  setupPersistence();
}
window.addEventListener("load", setupPersistence);
}
