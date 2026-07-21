// =============================================================================
// popup-sections.js — DOM builders for the Policy Match Tester split panel
// and the two collapsible audit-result sections.
//
// Visual design: modelled on the Cisco Umbrella "Policy Tester" modal and
// FortiGate "Policy Lookup" panel — two-column split (form left, results right),
// orange title, bold section headers, descriptive hint text in grey italic,
// RESET as a text-link, RUN TEST as a filled teal button.
//
// Exported to window.PopupSections.  No browser-extension API calls.
// =============================================================================

(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Design tokens
  // ---------------------------------------------------------------------------

  const COLOR = {
    // Severity
    critical: { bg: "#dc2626", light: "#fef2f2", border: "#fca5a5" },
    high:     { bg: "#ea580c", light: "#fff7ed", border: "#fdba74" },
    medium:   { bg: "#ca8a04", light: "#fefce8", border: "#fde047" },
    low:      { bg: "#6b7280", light: "#f9fafb", border: "#d1d5db" },
    // Action
    allow:   { bg: "#16a34a", text: "#fff" },
    block:   { bg: "#c0392b", text: "#fff" },
    isolate: { bg: "#7c3aed", text: "#fff" }, // distinct purple — not yet seen live, added defensively (see audit)
    unknown: { bg: "#6b7280", text: "#fff" },
  };

  // ---------------------------------------------------------------------------
  // Inject the shared stylesheet once
  // ---------------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById("psc-style")) return;
    const s = document.createElement("style");
    s.id = "psc-style";
    s.textContent = `

      /* ================================================================== */
      /* TESTER PANEL                                                       */
      /* ================================================================== */
      #psc-panel {
        background: var(--hbr-color-bg-card);
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
        display: flex;
        flex-direction: column;
      }

      #psc-panel-title {
        padding: 18px 20px 4px;
        font-size: 15px;
        font-weight: 700;
        color: var(--hbr-color-text-heading);
        letter-spacing: -0.01em;
      }
      #psc-panel-desc {
        padding: 0 20px 14px;
        font-size: 11.5px;
        color: var(--hbr-color-text-weak);
        line-height: 1.55;
        border-bottom: 1px solid var(--hbr-color-border);
      }
      #psc-panel-desc a { color: var(--hbr-color-accent); text-decoration: none; }
      #psc-panel-desc a:hover { text-decoration: underline; }

      #psc-panel-body {
        display: flex;
        flex-direction: column;
      }

      #psc-form-row {
        display: flex;
        gap: 14px;
        padding: 16px 20px 0;
      }
      #psc-form-row .psc-panel-section {
        flex: 1 1 0;
        min-width: 0;
      }

      #psc-form-footer {
        padding: 12px 20px 16px;
        border-bottom: 1px solid var(--hbr-color-border);
      }

      /* Source / Destination cards */
      .psc-panel-section {
        border: 1px solid var(--hbr-color-border);
        border-radius: var(--hbr-radius-lg);
        padding: 14px;
        background: var(--hbr-color-bg-subtle);
        box-shadow: var(--glass-shadow-sm);
        transition: box-shadow 0.2s;
      }
      .psc-panel-section:hover {
        box-shadow: var(--glass-shadow);
      }
      .psc-panel-section-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--hbr-color-accent);
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--hbr-color-border);
        padding-bottom: 8px;
      }

      .psc-field-group { margin: 0; }
      .psc-field-group--first { margin-top: var(--hbr-space-lg); }
      .psc-field-group:not(.psc-field-group--first) { margin-top: var(--hbr-space-md); }

      .psc-field-label {
        font-size: 11.5px;
        font-weight: 600;
        color: var(--hbr-color-text-heading);
        margin: 0 0 var(--hbr-space-xs) 0;
        display: block;
      }
      .psc-field-hint {
        font-size: 10.5px;
        color: var(--hbr-color-text-weak);
        font-style: italic;
        margin: 0 0 var(--hbr-space-sm) 0;
        line-height: 1.45;
        display: block;
      }

      .psc-refine-divider {
        margin-top: var(--hbr-space-md);
        padding-top: var(--hbr-space-sm);
        border-top: 1px dashed var(--hbr-color-border);
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--hbr-color-text-weak);
      }
      .psc-refine-divider-optional {
        font-weight: 400;
        text-transform: none;
        letter-spacing: normal;
        font-style: italic;
      }
      #psc-refine-group .psc-field-label {
        font-weight: 500;
        color: var(--hbr-color-text-weak);
      }

      /* Inputs */
      .psc-field-group input,
      .psc-field-group select {
        width: 100%;
        padding: 7px 10px;
        border: 1px solid rgba(0,0,0,0.12);
        border-radius: var(--hbr-radius-md);
        font-size: 12px;
        font-family: inherit;
        font-weight: 400;
        color: var(--hbr-color-text-body);
        background: #fff;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .psc-field-group input:focus,
      .psc-field-group select:focus {
        border-color: var(--hbr-color-accent);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }
      .psc-field-group input::placeholder { color: #9ca3af; }

      /* Form actions */
      #psc-form-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
      }
      #psc-reset-btn {
        background: none;
        border: none;
        color: var(--hbr-color-text-weak);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        padding: 6px 10px;
        font-family: inherit;
        border-radius: var(--hbr-radius-md);
        transition: color 0.15s, background 0.15s;
      }
      #psc-reset-btn:hover { color: var(--hbr-color-text-heading); background: var(--hbr-color-bg-subtle); }
      #psc-run-btn {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        color: #fff;
        border: none;
        border-radius: var(--hbr-radius-md);
        padding: 8px 22px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        cursor: pointer;
        font-family: inherit;
        transition: box-shadow 0.2s, transform 0.1s;
        box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
      }
      #psc-run-btn:hover:not(:disabled) {
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
        transform: translateY(-1px);
      }
      #psc-run-btn:active:not(:disabled) { transform: translateY(0); }
      #psc-run-btn:disabled { background: #93b4e8; box-shadow: none; cursor: not-allowed; }

      #psc-form-error {
        font-size: 11px;
        color: #dc2626;
        min-height: 16px;
        margin-bottom: 6px;
      }

      /* Results area */
      #psc-result-col {
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
      }
      #psc-result-placeholder {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--hbr-color-text-weak);
        font-size: 12.5px;
        font-style: italic;
        text-align: center;
        padding: 24px;
        min-height: 160px;
      }

      /* Result card */
      .psc-result-card {
        border: 1px solid var(--hbr-color-border);
        border-radius: var(--hbr-radius-lg);
        overflow: hidden;
        font-size: 12px;
        background: #fff;
        box-shadow: var(--glass-shadow-sm);
      }
      .psc-result-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        font-weight: 600;
        font-size: 12px;
      }
      .psc-result-allow { background: #f0fdf4; color: #166534; border-bottom: 1px solid #bbf7d0; }
      .psc-result-block { background: #fef2f2; color: #991b1b; border-bottom: 1px solid #fecaca; }
      .psc-result-isolate { background: #f5f3ff; color: #5b21b6; border-bottom: 1px solid #ddd6fe; }
      .psc-result-unknown { background: #f9fafb; color: var(--hbr-color-text-weak); border-bottom: 1px solid var(--hbr-color-border); }
      .psc-result-body { padding: 12px 14px; }
      .psc-result-rule-name {
        font-weight: 600;
        color: var(--hbr-color-text-heading);
        margin-bottom: 4px;
        font-size: 13px;
      }
      .psc-result-meta {
        font-size: 10.5px;
        color: var(--hbr-color-text-weak);
        margin-bottom: 10px;
      }
      .psc-result-cond-title {
        font-size: 10px;
        font-weight: 700;
        color: var(--hbr-color-text-weak);
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .psc-result-cond-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .psc-result-cond-list li {
        font-size: 11px;
        color: var(--hbr-color-text-body);
        display: flex;
        align-items: flex-start;
        gap: 6px;
        line-height: 1.45;
      }
      .psc-result-cond-list li::before {
        content: "\u2192";
        color: var(--hbr-color-accent);
        flex-shrink: 0;
        margin-top: 1px;
        font-weight: 600;
      }

      /* Field grid */
      .psc-result-fields {
        display: flex;
        flex-direction: column;
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: var(--hbr-radius-md);
        overflow: hidden;
      }
      .psc-result-field-row {
        display: grid;
        grid-template-columns: 108px 1fr;
        gap: 8px;
        padding: 7px 12px;
        font-size: 11px;
        border-bottom: 1px solid rgba(0,0,0,0.05);
        background: #fff;
      }
      .psc-result-field-row:last-child { border-bottom: none; }
      .psc-result-field-row.psc-field-unconstrained { background: #f9fafb; }
      .psc-result-field-label {
        color: var(--hbr-color-text-weak);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        font-size: 10px;
        padding-top: 1px;
      }
      .psc-result-field-value {
        color: var(--hbr-color-text-body);
        word-break: break-word;
      }
      .psc-result-field-value.psc-field-any {
        color: #9ca3af;
        font-style: italic;
      }

      .psc-no-match-card {
        border: 1px solid var(--hbr-color-border);
        border-radius: var(--hbr-radius-lg);
        padding: 14px;
        background: #f9fafb;
        font-size: 12px;
        color: var(--hbr-color-text-weak);
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }

      /* Badges */
      .psc-badge-action {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        border-radius: var(--hbr-radius-pill);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .psc-badge-default {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        border-radius: var(--hbr-radius-pill);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        white-space: nowrap;
        flex-shrink: 0;
        background: #f3f4f6;
        color: var(--hbr-color-text-weak);
        border: 1px solid rgba(0,0,0,0.06);
      }
      .psc-badge-sev {
        display: inline-flex;
        align-items: center;
        padding: 1px 7px;
        border-radius: var(--hbr-radius-pill);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: #fff;
        flex-shrink: 0;
        vertical-align: middle;
      }
      .psc-badge-findings {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: var(--hbr-radius-pill);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        white-space: nowrap;
        flex-shrink: 0;
        color: #fff;
      }
      .psc-badge-findings-clean {
        background: #f0fdf4;
        color: #166534;
        border: 1px solid #bbf7d0;
        font-weight: 600;
      }

      /* Highlight button */
      #psc-highlight-btn {
        margin-top: 12px;
        padding: 6px 14px;
        font-size: 11px;
        font-weight: 600;
        border: 1.5px solid var(--hbr-color-accent);
        background: var(--hbr-color-accent-light);
        color: var(--hbr-color-accent);
        border-radius: var(--hbr-radius-md);
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
        display: inline-block;
      }
      #psc-highlight-btn:hover { background: #dbeafe; }

      /* ================================================================== */
      /* AUDIT SECTIONS                                                     */
      /* ================================================================== */
      #psc-audit-root {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .psc-section {
        border-top: 1px solid var(--hbr-color-border);
        background: var(--hbr-color-bg-card);
        font-size: 12px;
      }
      .psc-section summary {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        list-style: none;
        user-select: none;
        color: var(--hbr-color-text-heading);
        transition: background 0.15s;
      }
      .psc-section summary:hover { background: rgba(0,0,0,0.02); }
      .psc-section summary::-webkit-details-marker { display: none; }
      .psc-section .psc-chevron {
        margin-left: auto;
        font-size: 10px;
        color: var(--hbr-color-text-weak);
        transition: transform 0.2s ease;
      }
      .psc-section[open] .psc-chevron { transform: rotate(180deg); }
      .psc-section-body {
        padding: 8px 20px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .psc-empty { color: var(--hbr-color-text-weak); font-style: italic; font-size: 11.5px; }

      .psc-good-item {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 6px 10px;
        border-radius: var(--hbr-radius-md);
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        font-size: 11.5px;
        color: #166534;
      }

      /* Rule groups */
      .psc-rule-group {
        border: 1px solid rgba(0,0,0,0.06);
        border-radius: var(--hbr-radius-lg);
        overflow: hidden;
        margin-bottom: 4px;
        background: #fff;
        box-shadow: var(--glass-shadow-sm);
        transition: box-shadow 0.2s;
      }
      .psc-rule-group:hover {
        box-shadow: var(--glass-shadow);
      }
      .psc-rule-group-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        background: #f9fafb;
        list-style: none;
        user-select: none;
        border-bottom: 1px solid transparent;
        transition: background 0.15s;
      }
      .psc-rule-group-header:hover { background: #f3f4f6; }
      .psc-rule-group[open] .psc-rule-group-header { border-bottom-color: rgba(0,0,0,0.06); }
      .psc-rule-group-header::-webkit-details-marker { display: none; }
      .psc-rule-group-header .psc-chevron {
        margin-left: auto;
        font-size: 9px;
        color: var(--hbr-color-text-weak);
        transition: transform 0.2s ease;
      }
      .psc-rule-group[open] .psc-rule-group-header .psc-chevron { transform: rotate(180deg); }
      .psc-check-list { padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
      .psc-check-item {
        border-left: 3px solid;
        padding: 6px 10px;
        border-radius: 0 var(--hbr-radius-sm) var(--hbr-radius-sm) 0;
        font-size: 11px;
        line-height: 1.5;
      }
      .psc-check-item-head {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 2px;
        font-weight: 600;
        font-size: 11px;
      }
      .psc-check-msg { color: var(--hbr-color-text-body); display: block; }
      .psc-check-detail { color: var(--hbr-color-text-weak); font-size: 10.5px; margin-top: 3px; }

      .psc-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        display: inline-block;
      }

      /* Dropdowns */
      .psc-dropdown-wrapper { position: relative; width: 100%; }
      .psc-dropdown-input {
        width: 100%; padding: 7px 10px; border: 1px solid rgba(0,0,0,0.12); border-radius: var(--hbr-radius-md);
        font-family: inherit; font-size: 12px; color: var(--hbr-color-text-body); background: #fff;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .psc-dropdown-input:focus { border-color: var(--hbr-color-accent); outline: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
      .psc-dropdown-list {
        position: absolute; top: calc(100% + 2px); left: 0; right: 0; background: #fff;
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: var(--hbr-radius-md); max-height: 200px; overflow-y: auto; z-index: 100;
        display: none; list-style: none; margin: 0; padding: 4px 0;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      }
      .psc-dropdown-list li {
        padding: 7px 10px; font-size: 11px; cursor: pointer;
        color: var(--hbr-color-text-body);
        transition: background 0.1s;
      }
      .psc-dropdown-list li:hover { background: var(--hbr-color-accent-light); }
      .psc-dropdown-id { color: var(--hbr-color-text-weak); font-size: 9px; margin-left: 5px; }

      /* Tooltip */
      #psc-tooltip {
        position: fixed;
        display: none;
        background: #1e293b;
        color: #f1f5f9;
        padding: 8px 12px;
        border-radius: var(--hbr-radius-md);
        font-size: 11px;
        font-family: var(--hbr-font-family);
        line-height: 1.5;
        white-space: pre-wrap;
        z-index: 99999;
        max-width: 350px;
        word-wrap: break-word;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        pointer-events: none;
      }
`;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // Tiny DOM factory
  // ---------------------------------------------------------------------------

  // These IDL attributes are read-only reflected properties on their elements
  // (the getter exists but the setter does not, or is no-op).  They must be
  // set via setAttribute() instead of direct property assignment.
  const ATTR_ONLY = new Set(["list", "for", "htmlFor", "enctype", "form"]);

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") {
        e.className = v;
      } else if (k === "style" && typeof v === "object") {
        Object.assign(e.style, v);
      } else if (ATTR_ONLY.has(k)) {
        e.setAttribute(k, v);
      } else {
        e[k] = v;
      }
    }
    for (const child of children) {
      if (child == null) continue;
      if (typeof child === "string") e.appendChild(document.createTextNode(child));
      else e.appendChild(child);
    }
    return e;
  }

  // ---------------------------------------------------------------------------
  // Tooltip Helper
  // ---------------------------------------------------------------------------
  let tooltipEl = null;
  function showTooltip(evt, content) {
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.id = "psc-tooltip";
      document.body.appendChild(tooltipEl);
    }
    tooltipEl.textContent = content;
    tooltipEl.style.display = "block";
    positionTooltip(evt);
  }

  function positionTooltip(evt) {
    if (!tooltipEl || tooltipEl.style.display === "none") return;
    const rect = tooltipEl.getBoundingClientRect();
    let left = evt.clientX + 15;
    let top = evt.clientY + 15;
    if (left + rect.width > window.innerWidth) left = evt.clientX - rect.width - 15;
    if (top + rect.height > window.innerHeight) top = evt.clientY - rect.height - 15;
    tooltipEl.style.left = Math.max(5, left) + "px";
    tooltipEl.style.top = Math.max(5, top) + "px";
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = "none";
  }

  // addTooltip expects a plain, already human-readable string — no JSON is
  // ever shown to the user (see describeCondition() below for condition
  // tooltips, and each call site for rule/finding-metadata tooltips). The
  // typeof-object fallback exists only as a last-resort safety net (e.g. an
  // unexpected non-string value slipping through) and deliberately does NOT
  // use JSON.stringify — it just stringifies plainly.
  function addTooltip(el, content) {
    if (typeof content !== "string") content = String(content);
    el.addEventListener("mouseenter", (e) => showTooltip(e, content));
    el.addEventListener("mousemove", positionTooltip);
    el.addEventListener("mouseleave", hideTooltip);
    el.style.cursor = "help";
  }

  function createSearchableSelect(labelStr, hintStr, inputId, itemsObj) {
    // itemsObj values are either a plain name string (apps, protocols) or, for
    // categories, an object { name, categoryId } — see categories-lookup.json.
    // "id" (the object key) is what getValue() returns and is sent as the test
    // value, so it MUST be the field that actually drives rule matching
    // (bitfieldPosition for categories, not the Cisco-dashboard-facing categoryId).
    const items = Object.entries(itemsObj || {}).map(([id, raw]) => {
      const isObj = raw && typeof raw === "object";
      return {
        id,
        name: isObj ? String(raw.name) : String(raw),
        categoryId: isObj ? raw.categoryId : undefined,
      };
    });
    
    const wrapper = el("div", { class: "psc-dropdown-wrapper" });
    const input = el("input", {
      id: inputId,
      class: "psc-dropdown-input",
      type: "text",
      placeholder: "Search...",
      autocomplete: "off",
      disabled: true // Initially disabled until data is passed in
    });
    const list = el("ul", { class: "psc-dropdown-list" });
    wrapper.appendChild(input);
    wrapper.appendChild(list);

    let selectedId = null;

    function renderList(query) {
      list.innerHTML = "";
      const q = query.toLowerCase().trim();
      const filtered = items.filter(i => i.name.toLowerCase().includes(q) || String(i.id).includes(q));
      
      const maxResults = 50;
      const results = filtered.slice(0, maxResults);
      
      if (results.length === 0) {
        list.appendChild(el("li", { style: { color: "var(--hbr-color-text-weak)", fontStyle: "italic" } }, ["No matches"]));
      } else {
        for (const item of results) {
          const li = el("li", {}, [
            item.name,
            el("span", { class: "psc-dropdown-id" }, [
              item.categoryId !== undefined
                ? `(bitfield: ${item.id} · categoryId: ${item.categoryId})`
                : `(ID: ${item.id})`
            ])
          ]);
          li.addEventListener("mousedown", (e) => {
            // mousedown fires before blur
            e.preventDefault();
            selectedId = item.id;
            input.value = item.name;
            list.style.display = "none";
          });
          list.appendChild(li);
        }
      }
      list.style.display = "block";
    }

    input.addEventListener("focus", () => renderList(input.value));
    input.addEventListener("input", () => {
      selectedId = null; 
      renderList(input.value);
    });
    input.addEventListener("blur", () => {
      setTimeout(() => { list.style.display = "none"; }, 100);
      if (!selectedId) input.value = "";
    });

    const group = el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: inputId }, [labelStr]),
      el("span",  { class: "psc-field-hint" }, [hintStr]),
      wrapper
    ]);

    return {
      element: group,
      wrapper,
      input,
      getValue: () => selectedId,
      reset: () => { selectedId = null; input.value = ""; }
    };
  }


  function actionBadge(action) {
    const key = (action || "").toLowerCase();
    const c = COLOR[key] || COLOR.unknown;
    return el("span", { class: "psc-badge-action", style: { background: c.bg, color: c.text } },
      [(action || "?").toUpperCase()]);
  }

  function defaultBadge() {
    return el("span", { class: "psc-badge-default" }, ["DEFAULT"]);
  }

  function sevBadge(sev) {
    const c = COLOR[sev] || COLOR.low;
    return el("span", { class: "psc-badge-sev", style: { background: c.bg } }, [sev.toUpperCase()]);
  }

  // ---------------------------------------------------------------------------
  // describeCondition — plain-English rendering of a single raw ruleCondition
  // ({attributeName, attributeOperator, attributeValue}), for tooltips that
  // used to dump this object as JSON. Deliberately generic/low-level (just
  // describes the operator+value), complementing rather than duplicating
  // summarizeConditions() above the two callers — the visible bullet/line
  // text already carries the resolved, lookup-driven human label (e.g. "App
  // Categories: Generative AI"); this fills in the technical detail on
  // hover, in a sentence instead of a JSON blob.
  // ---------------------------------------------------------------------------
  // resolveConditionIdLabel — best-effort ID→name resolution for a single
  // raw ID, used by describeConditionValue()/describeCondition() so the
  // hover tooltip shows the same resolved names as the visible label:value
  // grid (summarizeConditions()) instead of exposing the raw numeric ID
  // again on hover. Mirrors the same lookups object (lookups.identities /
  // lookups.objects / lookups.categories / lookups.apps / lookups.protocols)
  // summarizeConditions() already uses — kept the ID visible in parens too,
  // since this tooltip is explicitly the "technical detail" surface.
  function resolveConditionIdLabel(attributeName, id, lookups) {
    lookups = lookups || {};
    const an = (attributeName || "").toLowerCase();

    if (an.includes("identity")) {
      const name = lookups.identities && lookups.identities[String(id)];
      return name ? `${name} (ID ${id})` : `[unknown identity ${id}]`;
    }
    if (an.includes("private_resource")) {
      const name = lookups.objects && lookups.objects[String(id)];
      return name ? `${name} (ID ${id})` : `[unknown resource ${id}]`;
    }
    if (an.includes("category")) {
      const entry = lookups.categories && lookups.categories[id];
      const name = entry ? (typeof entry === "object" ? entry.name : entry) : null;
      return name ? `${name} (ID ${id})` : `[unknown category ${id}]`;
    }
    if (an.includes("application")) {
      if (lookups.apps && lookups.apps[id] !== undefined) return `${lookups.apps[id]} (ID ${id})`;
      if (lookups.protocols && lookups.protocols[id] !== undefined) return `${lookups.protocols[id]} (ID ${id})`;
      return `[unknown app ${id}]`;
    }
    return String(id);
  }

  function describeConditionValue(value, attributeName, lookups) {
    if (value === true) return "true (catch-all — matches everything)";
    if (value === false) return "false";
    if (Array.isArray(value)) {
      if (value.length === 0) return "an empty list";
      if (typeof value[0] === "object" && value[0] !== null) {
        // composite_inline_ip-style entries: [{ip, port, protocol}] — plain
        // IPs/ports, nothing to resolve against a lookup.
        return value.map(v => {
          const parts = [];
          if (v.ip)       parts.push(`IP ${Array.isArray(v.ip) ? v.ip.join(", ") : v.ip}`);
          if (v.port)     parts.push(`port ${Array.isArray(v.port) ? v.port.join(", ") : v.port}`);
          if (v.protocol) parts.push(`protocol ${v.protocol}`);
          return parts.join(", ");
        }).join(" ; ");
      }
      // ID-bearing condition types — resolve each entry via lookups when
      // available; falls back to the raw ID (old behavior) if lookups
      // wasn't passed in (defensive callers only, see describeCondition()).
      const an = (attributeName || "").toLowerCase();
      const isResolvable = an.includes("identity") || an.includes("private_resource") || an.includes("category") || an.includes("application");
      if (isResolvable && lookups) {
        return value.map(id => resolveConditionIdLabel(attributeName, id, lookups)).join(", ");
      }
      return value.join(", ");
    }
    return String(value);
  }

  const OPERATOR_PHRASES = { "=": "an exact match", "IN": "an IN match", "INTERSECT": "an INTERSECT match" };

  function describeCondition(cond, lookups) {
    if (!cond || !cond.attributeName) return "No condition details available.";
    const op = (cond.attributeOperator || "=").toUpperCase();
    const opPhrase = OPERATOR_PHRASES[op] || `a ${op} match`;
    return `This condition checks ${cond.attributeName} using ${opPhrase} against value ${describeConditionValue(cond.attributeValue, cond.attributeName, lookups)}.`;
  }

  // Static, always-visible finding-count badge for a rule card's collapsed
  // header — e.g. "2 HIGH · 1 MEDIUM", or a clean indicator when there are
  // no findings. Colored with the WORST severity present, same convention
  // already used by the card's severity dot (COLOR[worstSevStr].bg) — not a
  // new ad-hoc color scheme. Complements (doesn't replace) the existing
  // hover tooltip on the header, which still shows the fuller breakdown.
  function findingCountBadge(countBySev, worstSevStr) {
    const total = countBySev.critical + countBySev.high + countBySev.medium + countBySev.low;
    if (total === 0) {
      return el("span", { class: "psc-badge-findings psc-badge-findings-clean" }, ["✓ Clean"]);
    }
    const parts = [];
    for (const s of ["critical", "high", "medium", "low"]) {
      if (countBySev[s] > 0) parts.push(`${countBySev[s]} ${s.toUpperCase()}`);
    }
    const c = COLOR[worstSevStr] || COLOR.low;
    return el("span", { class: "psc-badge-findings", style: { background: c.bg } }, [parts.join(" · ")]);
  }

  // ---------------------------------------------------------------------------
  // buildTesterPanel — the main Policy Tester card, stacked layout:
  //   TOP:    Source + Destination panels side-by-side (roughly equal width)
  //   MIDDLE: error line + RESET/RUN TEST, full width
  //   BOTTOM: result pane — placeholder → result card, full width
  //
  // Returns { panel, updateResult(result) }
  // ---------------------------------------------------------------------------
  function buildTesterPanel(container, identityOptions, objectMaps, identityTypeMap, identityMap, onRun, onReset) {
    injectStyles();

    // Normalize objectMaps — support both the new multi-map structure and
    // the legacy single objectMap (backward compat for older SW versions)
    const maps = objectMaps && objectMaps.privateResources ? objectMaps : {
      privateResources: objectMaps || {},
      destinationLists: {},
      networkObjects: {},
      serviceObjectGroups: {},
      applicationLists: {},
      categoryLists: {},
    };

    const panel = el("div", { id: "psc-panel" });

    // Title + description
    panel.appendChild(el("div", { id: "psc-panel-title" }, ["Policy Tester"]));
    panel.appendChild(el("div", { id: "psc-panel-desc" }, [
      "Test whether a destination will be allowed or blocked for an identity. " +
      "If you receive results you don't expect, reorder or refine your policies and run the test again."
    ]));

    const body = el("div", { id: "psc-panel-body" });

    // ---- TOP: Source + Destination side-by-side row ----
    const formRow = el("div", { id: "psc-form-row" });

    // SOURCE panel
    const sourceSection = el("div", { class: "psc-panel-section" });
    sourceSection.appendChild(el("div", { class: "psc-panel-section-title" }, ["Source"]));

    const sourceInput = el("input", {
      id: "psc-src",
      type: "text",
      placeholder: "IP, CIDR, or IP:Port (e.g. 93.184.216.5:8080)",
      autocomplete: "off",
    });
    sourceSection.appendChild(el("div", { class: "psc-field-group psc-field-group--first" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-src" }, ["Source IP / CIDR"]),
      el("span",  { class: "psc-field-hint" }, ["Enter IPv4 address, CIDR block, or IP:Port."]),
      sourceInput,
    ]));

    // Identity — autocomplete dropdown using stored identity records
    // identityOptions is a string[] from getIdentityOptions(rules) containing
    // all identity IDs referenced by rules. Use identityMap (id → name) to
    // show friendly labels in the dropdown while keeping the ID as the value.
    const identityItems = {};
    if (Array.isArray(identityOptions)) {
      identityOptions.forEach(id => {
        const label = identityMap && identityMap[id] ? `${identityMap[id]} (${id})` : id;
        identityItems[id] = label;
      });
    }
    const identitySelect = createSearchableSelect(
      "Identity",
      "Search identities (AD groups, users, devices).",
      "psc-identity",
      identityItems
    );
    identitySelect.input.disabled = false;
    sourceSection.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-identity" }, ["Identity"]),
      el("span",  { class: "psc-field-hint" }, ["Select or search for an identity from your rules."]),
      identitySelect.wrapper,
    ]));

    // Identity Type dropdown — tests umbrella.source.identity_type_ids
    // identityTypeMap is passed in from RUN_SCAN's resolveIdentityTypes()
    // (see service-worker.js), mapping typeId → type name (e.g., "57" → "Roaming Computers")
    const identityTypeSelect = createSearchableSelect(
      "Identity Type",
      "Search identity types (e.g., AD Groups, Roaming Computers).",
      "psc-identity-type",
      identityTypeMap || {}
    );
    identityTypeSelect.input.disabled = false;
    sourceSection.appendChild(identityTypeSelect.element);

    formRow.appendChild(sourceSection);

    // DESTINATION panel
    const destSection = el("div", { class: "psc-panel-section" });
    destSection.appendChild(el("div", { class: "psc-panel-section-title" }, ["Destination"]));

    const destInput = el("input", {
      id: "psc-dest",
      type: "text",
      placeholder: "IP, CIDR, or IP:Port (e.g. 93.184.216.5:8080)",
      autocomplete: "off",
    });
    destSection.appendChild(el("div", { class: "psc-field-group psc-field-group--first" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-dest" }, ["Destination IP / CIDR"]),
      el("span",  { class: "psc-field-hint" }, ["Enter IPv4 address, CIDR block, or IP:Port."]),
      destInput,
    ]));

    // Visual divider marking the three dropdowns below as secondary
    // refinements of the primary Destination IP/CIDR match, not equal-weight
    // fields — reinforces IP-based Source/Destination matching as the core
    // mental model. Purely presentational: matcher.js still evaluates all
    // four with identical, full logical weight (see matchesRule()).
    destSection.appendChild(el("div", { class: "psc-refine-divider" }, [
      el("span", {}, ["Refine by "]),
      el("span", { class: "psc-refine-divider-optional" }, ["(optional)"]),
    ]));

    // New Dropdowns
    const dropdownContainer = el("div", { id: "psc-refine-group" });
    destSection.appendChild(dropdownContainer);
    
    // We will build them synchronously but disabled, then enable them
    const appSelect = createSearchableSelect("Internet Application", "Search applications.", "psc-app", {});
    const protoSelect = createSearchableSelect("Application Protocol", "Search protocols.", "psc-proto", {});
    const catSelect = createSearchableSelect("Content Category", "Search categories.", "psc-cat", {});

    // Private Resource / Resource Group — tests Private Access rule
    // destinations (private_resource_ids / private_resource_group_ids),
    // e.g. "Segmented Devices". Unlike apps/protocols/categories above,
    // objectMaps is live per-org data already resolved by RUN_SCAN's
    // resolveObjectRefs() (see service-worker.js) and passed in as a
    // parameter, not a separate static-JSON fetch — so this one doesn't
    // need the disabled-then-async-enable pattern, it's populated and
    // enabled immediately. maps.privateResources merges both
    // private_resources and private_resource_groups into one { id: name }
    // map; matcher.js's private_resource matching doesn't need to know
    // which kind an ID is.
    const privResSelect = createSearchableSelect(
      "Private Resource / Resource Group",
      "Search private resources or groups (Private Access rule destinations).",
      "psc-privres",
      maps.privateResources || {}
    );
    // createSearchableSelect() always starts its input disabled — a sane
    // default for appSelect/protoSelect/catSelect, which start with zero
    // items and only get enabled once loadLookups() resolves below. This
    // one is different: objectMaps is already-resolved, fully-populated data
    // by the time buildTesterPanel() is called (not a separate async fetch
    // this function kicks off itself), so there's no later step that would
    // otherwise flip this back on — has to be done explicitly right here.
    privResSelect.input.disabled = false;

    // Destination List — tests umbrella.destination.destination_list_ids
    const destListSelect = createSearchableSelect(
      "Destination List",
      "Search destination lists (URL/domain/IP lists).",
      "psc-destlist",
      maps.destinationLists || {}
    );
    destListSelect.input.disabled = false;

    // Network Object — tests umbrella.destination.networkObjectIds
    const netObjSelect = createSearchableSelect(
      "Network Object",
      "Search network objects (IP ranges, hosts).",
      "psc-netobj",
      maps.networkObjects || {}
    );
    netObjSelect.input.disabled = false;

    // Service Object Group — tests umbrella.destination.serviceObjectGroupIds
    const svcObjSelect = createSearchableSelect(
      "Service Object Group",
      "Search service object groups (protocol/port combinations).",
      "psc-svcobj",
      maps.serviceObjectGroups || {}
    );
    svcObjSelect.input.disabled = false;

    // Application List — tests umbrella.destination.application_list_ids
    const appListSelect = createSearchableSelect(
      "Application List",
      "Search application lists (predefined app groups).",
      "psc-applist",
      maps.applicationLists || {}
    );
    appListSelect.input.disabled = false;

    // Category List — tests umbrella.destination.category_list_ids
    const catListSelect = createSearchableSelect(
      "Category List",
      "Search category lists (predefined category groups).",
      "psc-catlist",
      maps.categoryLists || {}
    );
    catListSelect.input.disabled = false;

    dropdownContainer.appendChild(appSelect.element);
    dropdownContainer.appendChild(protoSelect.element);
    dropdownContainer.appendChild(catSelect.element);
    dropdownContainer.appendChild(privResSelect.element);
    dropdownContainer.appendChild(destListSelect.element);
    dropdownContainer.appendChild(netObjSelect.element);
    dropdownContainer.appendChild(svcObjSelect.element);
    dropdownContainer.appendChild(appListSelect.element);
    dropdownContainer.appendChild(catListSelect.element);

    // Asynchronously populate from lookups
    loadLookups().then(lookups => {
      // Re-initialize with data by replacing the elements
      const newAppSelect = createSearchableSelect("Internet Application", "Search applications.", "psc-app", lookups.apps);
      const newProtoSelect = createSearchableSelect("Application Protocol", "Search protocols.", "psc-proto", lookups.protocols);
      const newCatSelect = createSearchableSelect("Content Category", "Search categories.", "psc-cat", lookups.categories);
      
      newAppSelect.input.disabled = false;
      newProtoSelect.input.disabled = false;
      newCatSelect.input.disabled = false;
      
      dropdownContainer.innerHTML = "";
      dropdownContainer.appendChild(newAppSelect.element);
      dropdownContainer.appendChild(newProtoSelect.element);
      dropdownContainer.appendChild(newCatSelect.element);
      // These aren't re-created here — they're sourced from objectMaps
      // (already populated at construction time), not loadLookups() — but
      // the innerHTML reset clears the whole container, so they all have
      // to be re-appended or they'd silently disappear from the form.
      dropdownContainer.appendChild(privResSelect.element);
      dropdownContainer.appendChild(destListSelect.element);
      dropdownContainer.appendChild(netObjSelect.element);
      dropdownContainer.appendChild(svcObjSelect.element);
      dropdownContainer.appendChild(appListSelect.element);
      dropdownContainer.appendChild(catListSelect.element);

      // Update our closure refs
      appSelect.getValue = newAppSelect.getValue;
      protoSelect.getValue = newProtoSelect.getValue;
      catSelect.getValue = newCatSelect.getValue;
      appSelect.reset = newAppSelect.reset;
      protoSelect.reset = newProtoSelect.reset;
      catSelect.reset = newCatSelect.reset;
    });

    formRow.appendChild(destSection);
    body.appendChild(formRow);

    // ---- Error line + Reset/Run Test — below the row, still above results ----
    const formFooter = el("div", { id: "psc-form-footer" });

    const errorLine = el("p", { id: "psc-form-error" });
    formFooter.appendChild(errorLine);

    const runBtn   = el("button", { id: "psc-run-btn",   type: "button" }, ["Run Test"]);
    const resetBtn = el("button", { id: "psc-reset-btn", type: "button" }, ["Reset"]);
    formFooter.appendChild(el("div", { id: "psc-form-actions" }, [resetBtn, runBtn]));

    body.appendChild(formFooter);

    // ---- BELOW: results panel, full width ----
    const resultCol = el("div", { id: "psc-result-col" });
    const placeholder = el("div", { id: "psc-result-placeholder" }, [
      "Test results will appear here"
    ]);
    resultCol.appendChild(placeholder);
    body.appendChild(resultCol);

    panel.appendChild(body);
    container.appendChild(panel);

    // ---- updateResult — called by popup.js after matchPolicy() ----
    function updateResult(result) {
      resultCol.innerHTML = "";

      if (!result) {
        resultCol.appendChild(el("div", { id: "psc-result-placeholder" }, [
          "Test results will appear here"
        ]));
        return;
      }

      if (result === "NO_MATCH") {
        resultCol.appendChild(el("div", { class: "psc-no-match-card" }, [
          el("span", {}, ["No matching rule found — default action applies."]),
        ]));
        return;
      }

      const { rule, matchedConditions, matchFields } = result;
      const displayName   = rule.ruleName   || rule.name   || "(unnamed)";
      const displayAction = rule.ruleAction || rule.action || "unknown";
      const displayPrio   = rule.rulePriority !== undefined ? rule.rulePriority : rule.order;
      const displayId     = rule.ruleId      !== undefined ? rule.ruleId      : rule.id;
      const displayIsDefault = rule.ruleIsDefault !== undefined ? rule.ruleIsDefault === true : rule.is_default === true;

      const actionKey  = displayAction.toLowerCase();
      const headerCls  = actionKey === "allow"   ? "psc-result-allow"
                       : actionKey === "block"   ? "psc-result-block"
                       : actionKey === "isolate" ? "psc-result-isolate"
                       : "psc-result-unknown";

      const headerRow = el("div", { class: `psc-result-header ${headerCls}` }, [
          el("span", {}, [displayName]),
          actionBadge(displayAction),
      ]);
      {
        const enabledVal = rule.ruleIsEnabled !== undefined ? rule.ruleIsEnabled : rule.enabled;
        addTooltip(headerRow,
          `${displayName} — Priority ${displayPrio} — ${displayAction.toUpperCase()}\n` +
          `Enabled: ${enabledVal ? "Yes" : "No"} · Logging: ${rule.logging_enabled ? "Enabled" : "Disabled"}`
        );
      }

      // Clean label:value field grid (source/identity/destination/app),
      // replacing the old arrow-bullet "Matched because" text list — see
      // matchFields in matcher.js's matchesRule(). Each row's value already
      // carries resolved names (identity/category/app IDs) via
      // resolveDisplayValue(), not raw IDs. Falls back to the old freeform
      // list only if matchFields is missing for some reason (defensive —
      // shouldn't happen for a matched:true result).
      function fieldRow(field) {
        const rowCls   = field.constrained ? "psc-result-field-row" : "psc-result-field-row psc-field-unconstrained";
        const valueCls = field.constrained ? "psc-result-field-value" : "psc-result-field-value psc-field-any";
        return el("div", { class: rowCls }, [
          el("div", { class: "psc-result-field-label" }, [field.label]),
          el("div", { class: valueCls }, [field.display]),
        ]);
      }

      const matchedSection = matchFields
        ? el("div", { class: "psc-result-fields" }, [
            fieldRow(matchFields.source),
            fieldRow(matchFields.identity),
            fieldRow(matchFields.destination),
            fieldRow(matchFields.app),
          ])
        : el("ul", { class: "psc-result-cond-list" },
            matchedConditions.map((c) => {
              const li = el("li", {}, [c]);
              const conds = rule.ruleConditions || rule.conditions || [];
              const matchCond = conds.find(cond => c.includes(cond.attributeName));
              if (matchCond) addTooltip(li, describeCondition(matchCond));
              return li;
            })
          );

      // No unconditional "Priority: X" line — that's already visible in the
      // dashboard's own "#" column, right there under this same panel.
      // Only shown for default/catch-all rules, since "always evaluated
      // last" is genuinely new context the dashboard doesn't spell out (it
      // just places them under a separate "Default rules" heading) — same
      // reasoning as the Rules tab card's meta line above.
      const bodyChildren = [];
      if (displayIsDefault) {
        bodyChildren.push(el("div", { class: "psc-result-meta" }, [
          "Default rule (always evaluated last)"
        ]));
      }
      bodyChildren.push(
        el("div", { class: "psc-result-cond-title" }, ["Matched because"]),
        matchedSection
      );

      const card = el("div", { class: "psc-result-card" }, [
        headerRow,
        el("div", { class: "psc-result-body" }, bodyChildren),
      ]);

      // No "Highlight on page" button anymore — popup.js now highlights the
      // matched row (and scrolls to it) automatically right after Run Test,
      // and minimizes the embedded panel so the highlighted row is visible.
      // See popup.js's onRun handler.
      resultCol.appendChild(card);
    }

    // ---- wire buttons ----
    function parseIpInput(val, fieldName) {
      if (!val) return { ipCidr: "" };
      val = val.trim();
      let ipCidr = val;
      let port = null;
      
      const portMatch = val.match(/:(\d+)$/);
      if (portMatch) {
          port = portMatch[1];
          ipCidr = val.substring(0, val.length - portMatch[0].length);
      }
      
      const parts = ipCidr.split("/");
      if (parts.length > 2) return { error: `${fieldName}: Invalid format (multiple '/')`};
      
      const ip = parts[0];
      const octets = ip.split(".");
      if (octets.length !== 4) return { error: `${fieldName}: Invalid IPv4 address format (expected 4 octets)`};
      
      for (const oct of octets) {
          const num = parseInt(oct, 10);
          if (isNaN(num) || num < 0 || num > 255 || String(num) !== oct) {
              return { error: `${fieldName}: Invalid IP octet '${oct}'` };
          }
      }
      
      if (parts.length === 2) {
          const prefix = parseInt(parts[1], 10);
          if (isNaN(prefix) || prefix < 0 || prefix > 32 || String(prefix) !== parts[1]) {
              return { error: `${fieldName}: Invalid CIDR prefix '${parts[1]}'` };
          }
      }
      
      if (port !== null) {
          const p = parseInt(port, 10);
          if (p < 0 || p > 65535) return { error: `${fieldName}: Invalid port number '${port}'` };
      }
      
      return { ipCidr, port };
    }

    runBtn.addEventListener("click", () => {
      const srcVal = sourceInput.value.trim();
      const destVal = destInput.value.trim();
      const appId = appSelect.getValue();
      const protoId = protoSelect.getValue();
      const catId = catSelect.getValue();
      const privResId = privResSelect.getValue();
      const destListId = destListSelect.getValue();
      const netObjId = netObjSelect.getValue();
      const svcObjId = svcObjSelect.getValue();
      const appListId = appListSelect.getValue();
      const catListId = catListSelect.getValue();
      const identityTypeIdVal = identityTypeSelect.getValue();

      const identityVal = identitySelect.getValue();

      if (!srcVal && !destVal && !appId && !protoId && !catId && !identityVal && !identityTypeIdVal && !privResId && !destListId && !netObjId && !svcObjId && !appListId && !catListId) {
        errorLine.textContent = "Fill in at least one field before running the test.";
        return;
      }

      const srcParsed = parseIpInput(srcVal, "Source");
      if (srcParsed.error) {
        errorLine.textContent = srcParsed.error;
        return;
      }
      
      const destParsed = parseIpInput(destVal, "Destination");
      if (destParsed.error) {
        errorLine.textContent = destParsed.error;
        return;
      }

      errorLine.textContent = "";
      runBtn.disabled      = true;
      runBtn.textContent   = "Testing…";
      
      const testInput = {
        source:          srcParsed.ipCidr,
        sourcePort:      srcParsed.port,
        identity:        identityVal,
        identityTypeId:  identityTypeIdVal,
        applicationId:   appId,
        protocolId:      protoId,
        categoryId:      catId,
        destination:     destParsed.ipCidr,
        destinationPort: destParsed.port,
        privateResourceId: privResId,
        destinationListId: destListId,
        networkObjectId: netObjId,
        serviceObjectGroupId: svcObjId,
        applicationListId: appListId,
        categoryListId: catListId,
      };

      setTimeout(() => {
        // onRun is now async (it awaits PopupSections.loadLookups() before
        // matching, so matchedConditions can show resolved names instead of
        // raw IDs) — Promise.resolve()/.finally() so the button stays
        // disabled for the whole await instead of flipping back to "Run
        // Test" while the lookup fetch is still in flight.
        Promise.resolve(onRun(testInput)).finally(() => {
          runBtn.disabled = false;
          runBtn.textContent = "Run Test";
        });
      }, 0);
    });

    resetBtn.addEventListener("click", () => {
      sourceInput.value   = "";
      identitySelect.reset();
      appSelect.reset();
      protoSelect.reset();
      catSelect.reset();
      privResSelect.reset();
      destListSelect.reset();
      netObjSelect.reset();
      svcObjSelect.reset();
      appListSelect.reset();
      catListSelect.reset();
      identityTypeSelect.reset();
      destInput.value     = "";
      errorLine.textContent = "";
      onReset();
    });

    return { panel, updateResult };
  }

  let lookupsPromise = null;
  function loadLookups() {
    if (!lookupsPromise) {
      lookupsPromise = Promise.all([
        fetch("../data/categories-lookup.json").then(r => r.json()).catch(() => ({})),
        fetch("../data/apps-lookup.json").then(r => r.json()).catch(() => ({})),
        fetch("../data/protocols-lookup.json").then(r => r.json()).catch(() => ({}))
      ]).then(([categories, apps, protocols]) => ({ categories, apps, protocols }));
    }
    return lookupsPromise;
  }

  // ---------------------------------------------------------------------------
  // buildRulesList — single list of rules with inline findings or pass state
  // Returns { update(rules, findings, identityMap) }
  // ---------------------------------------------------------------------------
  function buildRulesList(container) {
    injectStyles();

    const root = el("div", { id: "psc-rules-list-root", style: { display: "flex", flexDirection: "column", gap: "10px", padding: "16px" } });
    container.appendChild(root);

    const SEV_ORDER = ["critical", "high", "medium", "low"];

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
            if (values === true) summaryText = `${type.split('.')[1]} = Any`;
            break;
          case "umbrella.source.identity_ids": {
            // Resolved live against org 8176184: identity IDs can be AD/SAML
            // groups (security_group_tag), Catalyst SD-WAN tags
            // (catalyst_sdwan), or branches/tunnels
            // (networkTunnelGroupsAndBranches, private-access rules) —
            // resolveIdentities() in service-worker.js queries all known
            // types and merges whatever each one matches into identityMap
            // (see lookups.identities here). Falls back to showing the raw
            // ID, same pattern as destination_list_ids/appRiskProfileId,
            // for any ID none of those endpoints recognized (e.g. its
            // resolving token wasn't captured in time, or it's a type we
            // haven't discovered yet).
            const identityNames = (Array.isArray(values) ? values : [values]).map((id) => {
              const name = lookups.identities && lookups.identities[String(id)];
              return name || `[unknown identity ${id}]`;
            });
            summaryText = `Identities: ${identityNames.join(", ")}`;
            break;
          }
          case "umbrella.source.identity_type_ids": {
            // Filters by identity TYPE (e.g., typeId 57 = "Roaming Computers",
            // 34 = "AD Groups"). Resolved via lookups.identityTypes from
            // resolveIdentityTypes() in service-worker.js.
            const typeNames = (Array.isArray(values) ? values : [values]).map((id) => {
              const name = lookups.identityTypes && lookups.identityTypes[String(id)];
              return name || `[unknown identity type ${id}]`;
            });
            summaryText = `Identity Types: ${typeNames.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_category_ids":
          case "umbrella.destination.category_ids": // alias — same concept, different field name per org (see matcher.js)
            // values here are bitfieldPosition, not categoryId — categories-lookup.json
            // is keyed by bitfieldPosition for exactly this reason (see data/categories-lookup.json).
            const catNames = Array.isArray(values) ? values.map(id => {
              const entry = lookups.categories[id];
              if (!entry) return `[unknown category ${id}]`;
              return typeof entry === "object" ? entry.name : entry;
            }) : [];
            summaryText = `App Categories: ${catNames.length ? catNames.join(", ") : values}`;
            break;
          case "umbrella.destination.application_ids": {
            // CONFIRMED via live API payload: umbrella.destination.application_ids is
            // the ONLY field used for both Internet Applications AND Application
            // Protocols — there is no separate umbrella.destination.protocol_ids field
            // in the real API (that case has been removed; see matcher.js for the
            // matching-side fix). An ID here may be either kind, so resolve against
            // apps-lookup.json first, then fall back to protocols-lookup.json, and
            // group the results into separate "Applications:" / "Protocols:" lines
            // rather than guessing a single label for a mixed ID set.
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
            if (appMatches.length)   parts.push(`Applications: ${appMatches.join(", ")}`);
            if (protoMatches.length) parts.push(`Protocols: ${protoMatches.join(", ")}`);
            if (unresolved.length)   parts.push(`Applications: ${unresolved.map(id => `[unknown app ${id}]`).join(", ")}`);
            summaryText = parts.length ? parts.join(" ; ") : `Applications: ${values}`;
            break;
          }
          case "umbrella.destination.composite_inline_ip":
            if (Array.isArray(values)) {
              const destParts = [];
              values.forEach(v => {
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
            // CONFIRMED via live API payload (org 8176184). Resolved via
            // lookups.destinationLists from resolveObjectRefs() in service-worker.js.
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => {
              const name = lookups.destinationLists && lookups.destinationLists[String(id)];
              return name || `[unknown destination list ${id}]`;
            });
            summaryText = `Destination Lists: ${names.join(", ")}`;
            break;
          }
          case "umbrella.destination.network_object_ids": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => {
              const name = lookups.networkObjects && lookups.networkObjects[String(id)];
              return name || `[unknown network object ${id}]`;
            });
            summaryText = `Network Objects: ${names.join(", ")}`;
            break;
          }
          case "umbrella.destination.service_object_group_ids": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => {
              const name = lookups.serviceObjectGroups && lookups.serviceObjectGroups[String(id)];
              return name || `[unknown service object group ${id}]`;
            });
            summaryText = `Service Object Groups: ${names.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_list_ids": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => {
              const name = lookups.applicationLists && lookups.applicationLists[String(id)];
              return name || `[unknown application list ${id}]`;
            });
            summaryText = `Application Lists: ${names.join(", ")}`;
            break;
          }
          case "umbrella.destination.category_list_ids": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => {
              const name = lookups.categoryLists && lookups.categoryLists[String(id)];
              return name || `[unknown category list ${id}]`;
            });
            summaryText = `Category Lists: ${names.join(", ")}`;
            break;
          }
          case "umbrella.destination.private_resource_ids":
          case "umbrella.destination.private_resource_group_ids": {
            // Resolved live against org 8176184 via resolveObjectRefs() in
            // service-worker.js (private_resources / private_resource_groups
            // endpoints), stored in lookups.privateResources.
            const isGroup = type.endsWith("_group_ids");
            const label = isGroup ? "Private Resource Groups" : "Private Resources";
            const resNames = (Array.isArray(values) ? values : [values]).map((id) => {
              const name = (lookups.privateResources && lookups.privateResources[String(id)]) ||
                           (lookups.objects && lookups.objects[String(id)]);
              return name || `Resource #${id}`;
            });
            summaryText = `${label}: ${resNames.join(", ")}`;
            break;
          }
          case "umbrella.destination.appRiskProfileId": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => {
              const name = lookups.appRiskProfiles && lookups.appRiskProfiles[String(id)];
              return name || `App Risk Profile #${String(id).substring(0, 8)}…`;
            });
            summaryText = ids.length === 1
              ? `App Risk Profile: ${names[0]}`
              : `App Risk Profiles: ${names.join(", ")}`;
            break;
          }
          case "umbrella.destination.composite_inline_ip": {
            // Inline IP/port/protocol objects — not named resources, render as
            // readable network specs: "IP: 198.18.0.0/16, Port: 0-65535, Protocol: ANY"
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
          case "umbrella.destination.private_resource_types": {
            const items = Array.isArray(values) ? values : [values];
            const labels = items.map((v) => {
              if (v === "apps") return "Applications";
              if (v === "networks") return "Networks";
              if (v === "websites") return "Websites";
              // Capitalize first letter as fallback
              return String(v).charAt(0).toUpperCase() + String(v).slice(1);
            });
            summaryText = `Resource Types: ${labels.join(", ")}`;
            break;
          }
          case "umbrella.source.networkObjectIds":
          case "umbrella.source.networkObjectIds_shared": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => (lookups.networkObjects && lookups.networkObjects[String(id)]) || `Network Object #${id}`);
            summaryText = `Source Network Objects: ${names.join(", ")}`;
            break;
          }
          case "umbrella.source.networkObjectGroupIds":
          case "umbrella.source.networkObjectGroupIds_shared": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => (lookups.networkObjectGroups && lookups.networkObjectGroups[String(id)]) || `Network Group #${id}`);
            summaryText = `Source Network Object Groups: ${names.join(", ")}`;
            break;
          }
          case "umbrella.source.geolocations": {
            const geos = Array.isArray(values) ? values : [values];
            summaryText = `Source Countries/Regions: ${geos.join(", ")}`;
            break;
          }
          case "umbrella.destination.networkObjectGroupIds": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => (lookups.networkObjectGroups && lookups.networkObjectGroups[String(id)]) || `Network Group #${id}`);
            summaryText = `Destination Network Object Groups: ${names.join(", ")}`;
            break;
          }
          case "umbrella.destination.serviceObjectIds": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => (lookups.serviceObjects && lookups.serviceObjects[String(id)]) || `Service Object #${id}`);
            summaryText = `Service Objects: ${names.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_category_ids": {
            const ids = Array.isArray(values) ? values : [values];
            summaryText = `Application Categories: ${ids.join(", ")}`;
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
            summaryText = `IPS Profile: ${values}`;
            break;
          }
          case "umbrella.posture.profileIdClientbased":
          case "umbrella.posture.profileIdClientless":
          case "umbrella.posture.vpnProfileId":
          case "umbrella.posture.webProfileId": {
            const label = type.replace("umbrella.posture.", "").replace(/([A-Z])/g, " $1");
            summaryText = `Posture (${label}): ${values}`;
            break;
          }
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

    async function update(rules, findings, identityMap, objectMap, objectMaps, identityTypeMap) {
      const lookups = await loadLookups();
      lookups.identities = identityMap || {};
      lookups.identityTypes = identityTypeMap || {};
      // objectMap is the legacy privateResources map; objectMaps has all types
      lookups.objects = objectMap || {};
      lookups.privateResources = (objectMaps && objectMaps.privateResources) || objectMap || {};
      lookups.destinationLists = (objectMaps && objectMaps.destinationLists) || {};
      lookups.networkObjects   = (objectMaps && objectMaps.networkObjects) || {};
      lookups.serviceObjectGroups = (objectMaps && objectMaps.serviceObjectGroups) || {};
      lookups.applicationLists = (objectMaps && objectMaps.applicationLists) || {};
      lookups.categoryLists    = (objectMaps && objectMaps.categoryLists) || {};
      lookups.appRiskProfiles  = (objectMaps && objectMaps.appRiskProfiles) || {};
      root.innerHTML = "";
      if (!rules || rules.length === 0) {
        root.appendChild(el("p", { class: "psc-empty", style: { textAlign: "center" } }, ["No rules available."]));
        return;
      }

      // Group findings by ruleId
      const findingsByRule = new Map();
      for (const f of findings || []) {
        if (!findingsByRule.has(f.ruleId)) findingsByRule.set(f.ruleId, []);
        findingsByRule.get(f.ruleId).push(f);
      }

      // Compute worst severity per rule
      const enrichedRules = rules.map(rule => {
        const rId = rule.ruleId !== undefined ? rule.ruleId : rule.id;
        const ruleFindings = findingsByRule.get(rId) || [];
        
        let worstSevIdx = 999;
        let worstSevStr = "none";
        for (const f of ruleFindings) {
          const idx = SEV_ORDER.indexOf(f.severity);
          if (idx !== -1 && idx < worstSevIdx) {
            worstSevIdx = idx;
            worstSevStr = f.severity;
          }
        }
        
        return {
          originalRule: rule,
          ruleFindings: ruleFindings,
          worstSevIdx: worstSevIdx,
          worstSevStr: worstSevStr
        };
      });

      // Sort: worst severity first, then by priority/order
      enrichedRules.sort((a, b) => {
        if (a.worstSevIdx !== b.worstSevIdx) {
          return a.worstSevIdx - b.worstSevIdx; // lower index = worse severity
        }
        // Fallback to priority order if available
        const prioA = a.originalRule.rulePriority !== undefined ? a.originalRule.rulePriority : a.originalRule.order;
        const prioB = b.originalRule.rulePriority !== undefined ? b.originalRule.rulePriority : b.originalRule.order;
        return (prioA || 0) - (prioB || 0);
      });

      // Render cards
      for (const er of enrichedRules) {
        const rule       = er.originalRule;
        const rName      = rule.ruleName   || rule.name   || "(unnamed)";
        const rAction    = rule.ruleAction || rule.action || "unknown";
        const rPrio      = rule.rulePriority !== undefined ? rule.rulePriority : rule.order;
        const rId        = rule.ruleId      !== undefined ? rule.ruleId      : rule.id;
        const rIsDefault = rule.ruleIsDefault !== undefined ? rule.ruleIsDefault === true : rule.is_default === true;

        const card = el("details", { class: "psc-rule-group", style: { marginBottom: "6px" } });

        // Tally findings by severity once — feeds both the static header
        // badge and the hover tooltip's fuller breakdown below.
        const countBySev = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const f of er.ruleFindings) {
          const s = (f.severity || "").toLowerCase();
          if (countBySev[s] !== undefined) countBySev[s]++;
        }

        // Header
        const tc = COLOR[er.worstSevStr] || { bg: "var(--hbr-color-text-weak)" }; // gray dot if clean
        const headerChildren = [
          el("span", { class: "psc-dot", style: { background: tc.bg, width: "10px", height: "10px" } }),
          el("span", { style: { flex: "1", fontWeight: "600", fontSize: "13px" } }, [rName]),
          // Static, always-visible finding count — visible even collapsed,
          // independent of the hover tooltip below (which still shows the
          // fuller ID/priority/JSON breakdown on hover).
          findingCountBadge(countBySev, er.worstSevStr),
        ];
        if (rIsDefault) headerChildren.push(defaultBadge());
        headerChildren.push(
          actionBadge(rAction),
          el("span", { class: "psc-chevron", style: { marginLeft: "8px" } }, ["▼"])
        );
        const header = el("summary", { class: "psc-rule-group-header", style: { padding: "10px 14px", fontSize: "12px" } }, headerChildren);

        // Add tooltip to collapsed header
        let findingSummary = "Clean (No Findings)";
        if (er.ruleFindings.length > 0) {
          const parts = [];
          for (const s of ["critical", "high", "medium", "low"]) {
            if (countBySev[s] > 0) parts.push(`${countBySev[s]} ${s.toUpperCase()}`);
          }
          findingSummary = parts.join(", ");
        }

        addTooltip(header,
          `${rName} — Priority ${rPrio} — ${rAction.toUpperCase()}\n` +
          (er.ruleFindings.length === 0
            ? "No findings — clean"
            : `${er.ruleFindings.length} finding${er.ruleFindings.length === 1 ? "" : "s"}: ${findingSummary}`) +
          (rIsDefault ? "\nDefault (built-in)" : "")
        );

        card.appendChild(header);

        const cardBody = el("div", { class: "psc-check-list", style: { padding: "12px 14px", borderTop: "1px solid var(--hbr-color-border)", background: "var(--hbr-color-bg-card)" } });

        // Meta — the raw priority/order number is dropped here: it's
        // already visible on the dashboard itself (the "#" row-order
        // column), so repeating it in every card added nothing. Only shown
        // for default/catch-all rules, since "always evaluated last" is
        // genuinely new context — the dashboard just places them under a
        // "Default rules" heading without explaining why.
        if (rIsDefault) {
          cardBody.appendChild(el("div", { class: "psc-result-meta", style: { marginBottom: "12px" } }, [
            "Default rule (always evaluated last)"
          ]));
        }

        // Findings OR Good indicator
        if (er.ruleFindings.length === 0) {
          const goodInd = el("div", { class: "psc-good-item", style: { marginBottom: "12px" } }, [
            el("span", { style: { flex: "1", fontWeight: "600" } }, ["Passed all checks — no issues found."])
          ]);
          cardBody.appendChild(goodInd);
        } else {
          // Group rule findings by checkId
          const checkMap = new Map();
          for (const f of er.ruleFindings) {
            if (!checkMap.has(f.checkId)) checkMap.set(f.checkId, []);
            checkMap.get(f.checkId).push(f);
          }
          
          const findingsList = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" } });
          for (const [checkId, cFindings] of checkMap) {
            const sortedF = [...cFindings].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
            for (const f of sortedF) {
              const fc = COLOR[f.severity] || COLOR.low;
              const item = el("div", { class: "psc-check-item", style: {
                borderLeftColor: fc.bg,
                background: fc.light,
              }}, [
                el("div", { class: "psc-check-item-head" }, [
                  sevBadge(f.severity),
                  el("span", { style: { color: "var(--hbr-color-text-heading)" } }, [checkId]),
                ]),
                el("span", { class: "psc-check-msg" }, [f.message]),
              ]);
              if (f.detail) {
                item.appendChild(el("div", { class: "psc-check-detail" }, [f.detail]));
              }
              
              let detailText;
              if (checkId === "SEC_PROFILE_MISSING" || checkId === "SEC_PROFILE_PARTIAL") {
                const sp = rule.security_profiles || {};
                const fmt = (v) => v === true ? "Enabled" : v === false ? "Disabled" : "Unconfirmed";
                detailText = `Security profiles — IPS: ${fmt(sp.ips_enabled)}, AMP/Malware: ${fmt(sp.amp_malware_enabled)}, ` +
                  `TLS Decryption: ${fmt(sp.tls_decryption_enabled)}, DLP: ${fmt(sp.dlp_enabled)}`;
              } else if (checkId === "LOGGING_DISABLED") {
                detailText = `Logging enabled: ${rule.logging_enabled ? "Yes" : "No"}`;
              } else {
                detailText = `${f.checkId} (${(f.severity || "").toUpperCase()}): ${f.message}`;
              }
              addTooltip(item, detailText);
              
              findingsList.appendChild(item);
            }
          }
          cardBody.appendChild(findingsList);
        }

        // What will usually match — same clean label:value field-grid style
        // as the Test Policy result panel (see updateResult()'s fieldRow()),
        // for visual consistency across both places conditions get shown.
        // summarizeConditions()'s entries are "Label: value" or
        // "dimension = value" text (already resolved to names, not raw IDs,
        // per the switch cases above) — splitLabelValue() below just peels
        // that apart into the two grid columns instead of changing
        // summarizeConditions()'s own return shape.
        function splitLabelValue(text) {
          const colonIdx = text.indexOf(": ");
          if (colonIdx > -1) return { label: text.slice(0, colonIdx), value: text.slice(colonIdx + 2) };
          const eqIdx = text.indexOf(" = ");
          if (eqIdx > -1) return { label: text.slice(0, eqIdx), value: text.slice(eqIdx + 3) };
          return { label: "Condition", value: text };
        }

        const matchConds = summarizeConditions(rule, lookups);
        const matchTitle = el("div", { class: "psc-result-cond-title", style: { display: "flex", alignItems: "center", gap: "4px", marginTop: "4px", marginBottom: "8px" } }, [
          el("span", {}, ["What will usually match"])
        ]);

        // Always render the same 4 fixed rows (Source / Identity /
        // Destination / App-Category-Protocol) the Test Policy result panel
        // uses (see matcher.js's matchesRule() matchFields), instead of only
        // a row per condition that happens to exist on this rule — a rule
        // with just a destination condition used to show a 1-2 row grid,
        // which read as incomplete/inconsistent next to the Test Policy
        // panel's always-4-row grid. window.Matcher.conditionDimension()
        // (already used for the same classification elsewhere) buckets each
        // summarized condition into its dimension; a dimension with no
        // conditions defaults to "Any", exactly like an unconstrained
        // Test Policy field. Multiple conditions in the same dimension are
        // combined into one row, values joined by "; ".
        const DIMENSION_META = {
          source:      { label: "Source" },
          identity:    { label: "Identity" },
          destination: { label: "Destination" },
          app:         { label: "App / Category / Protocol" },
        };
        const buckets = { source: [], identity: [], destination: [], app: [] };
        const unrecognized = [];

        for (const mc of matchConds) {
          // The catch-all "no specific conditions" message means every
          // dimension is unconstrained — already covered by the buckets
          // staying empty below, so skip adding it as its own row.
          if (!mc.raw && /applies to all traffic/i.test(mc.text)) continue;

          const attributeName = mc.raw && mc.raw.attributeName;
          const dimension = attributeName && window.Matcher && typeof window.Matcher.conditionDimension === "function"
            ? window.Matcher.conditionDimension(attributeName)
            : null;
          const { value } = splitLabelValue(mc.text);

          if (dimension && buckets[dimension]) {
            buckets[dimension].push({ value, raw: mc.raw });
          } else {
            // Safety net for any condition type conditionDimension() doesn't
            // recognize yet — shown as an extra row instead of silently
            // dropped.
            unrecognized.push(mc);
          }
        }

        function dimensionRow(key) {
          const meta = DIMENSION_META[key];
          const entries = buckets[key];
          const isAny = entries.length === 0;
          const value = isAny ? "Any" : entries.map(e => e.value).join("; ");
          const row = el("div", { class: isAny ? "psc-result-field-row psc-field-unconstrained" : "psc-result-field-row" }, [
            el("div", { class: "psc-result-field-label" }, [meta.label]),
            el("div", { class: isAny ? "psc-result-field-value psc-field-any" : "psc-result-field-value" }, [value]),
          ]);
          if (entries.length === 1 && entries[0].raw) {
            addTooltip(row, describeCondition(entries[0].raw, lookups));
          } else if (entries.length > 1) {
            addTooltip(row, entries.map(e => describeCondition(e.raw, lookups)).join("\n"));
          }
          return row;
        }

        const matchGrid = el("div", { class: "psc-result-fields" }, [
          dimensionRow("source"),
          dimensionRow("identity"),
          dimensionRow("destination"),
          dimensionRow("app"),
          ...unrecognized.map(mc => {
            const { label, value } = splitLabelValue(mc.text);
            const isAny = /^any$/i.test(value.trim());
            const row = el("div", { class: isAny ? "psc-result-field-row psc-field-unconstrained" : "psc-result-field-row" }, [
              el("div", { class: "psc-result-field-label" }, [label]),
              el("div", { class: isAny ? "psc-result-field-value psc-field-any" : "psc-result-field-value" }, [value]),
            ]);
            if (mc.raw) addTooltip(row, describeCondition(mc.raw, lookups));
            return row;
          }),
        ]);

        const matchBox = el("div", { style: { background: "var(--hbr-color-bg-subtle)", padding: "10px", borderRadius: "var(--hbr-radius-md)", border: "1px solid var(--hbr-color-border)" } }, [
          matchTitle,
          matchGrid
        ]);
        cardBody.appendChild(matchBox);

        card.appendChild(cardBody);
        root.appendChild(card);
      }
    }

    return { update };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  global.PopupSections = {
    buildTesterPanel,
    buildRulesList,
    // Exposed so popup.js can build the same { categories, apps, protocols }
    // lookups object (merged with the live identityMap) to pass into
    // window.Matcher.matchPolicy() for the Policy Tester's "MATCHED BECAUSE"
    // reasoning — reuses this module's cached fetch instead of duplicating
    // the static-JSON-loading logic in popup.js.
    loadLookups,

    // Kept for backward compat if anything still references old names
    buildAuditSections:    () => ({ goodSection: { update: () => {} }, badSection: { update: () => {} }, allRulesSection: { update: () => {} } }),
    buildWillMatchSection: () => ({ section: null, update: () => {} }),
    buildGoodSection:      () => ({ section: null, update: () => {} }),
    buildBadSection:       () => ({ section: null, update: () => {} }),
    buildTesterForm:       () => null,
  };
})(window);
