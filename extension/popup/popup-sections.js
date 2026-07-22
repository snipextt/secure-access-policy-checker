// =============================================================================
// popup-sections.js — DOM builders for the Policy Match Tester split panel
// and the single collapsible audit-result sections.
//
// Visual design: Dark Futuristic Cyberpunk HUD with sharp 2px borders,
// glowing neon status indicators, monospace technical accents, default IP+Port
// source/destination controls, toggleable advanced criteria, and inline rule chips.
//
// Exported to window.PopupSections. No browser-extension API calls.
// =============================================================================

(function (global) {
  "use strict";

  const COLOR = {
    critical: { bg: "#ef4444", light: "rgba(239, 68, 68, 0.15)", border: "#f87171" },
    high:     { bg: "#f97316", light: "rgba(249, 115, 22, 0.15)", border: "#fb923c" },
    medium:   { bg: "#eab308", light: "rgba(234, 179, 8, 0.15)", border: "#fde047" },
    low:      { bg: "#64748b", light: "rgba(100, 116, 139, 0.15)", border: "#94a3b8" },
    allow:    { bg: "#10b981", text: "#070a12" },
    block:    { bg: "#ef4444", text: "#fff" },
    isolate:  { bg: "#8b5cf6", text: "#fff" },
    unknown:  { bg: "#64748b", text: "#fff" },
  };

  function injectStyles() {
    if (document.getElementById("psc-style")) return;
    const s = document.createElement("style");
    s.id = "psc-style";
    s.textContent = `
      /* ================================================================== */
      /* FUTURISTIC DARK HUD THEME                                          */
      /* ================================================================== */
      #psc-panel {
        background: #070a12;
        color: #cbd5e1;
        display: flex;
        flex-direction: column;
        font-family: var(--hbr-font-family);
      }

      #psc-panel-title {
        padding: 14px 18px 2px;
        font-size: 13px;
        font-weight: 800;
        color: #06b6d4;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-family: var(--hbr-font-mono, monospace);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #psc-panel-title::before {
        content: "//";
        color: #3b82f6;
      }
      #psc-panel-desc {
        padding: 0 18px 10px;
        font-size: 11px;
        color: #64748b;
        line-height: 1.45;
        border-bottom: 1px solid #1e293b;
      }

      #psc-panel-body {
        display: flex;
        flex-direction: column;
      }

      #psc-form-row {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px 18px 0;
        width: 100%;
      }

      /* Default Primary IP+Port Cards */
      .psc-hud-card {
        border: 1px solid #1e293b;
        border-radius: 2px;
        padding: 12px 14px;
        background: #0f172a;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        display: flex;
        flex-direction: column;
        gap: 10px;
        position: relative;
      }
      .psc-hud-card::before {
        content: "";
        position: absolute;
        top: 0; left: 0; width: 3px; bottom: 0;
        background: #06b6d4;
      }

      .psc-hud-title {
        font-size: 10.5px;
        font-weight: 700;
        color: #38bdf8;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: var(--hbr-font-mono, monospace);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      /* Toggle Buttons for Advanced Criteria */
      .psc-toggle-btn {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 2px;
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.15s;
        width: 100%;
        font-family: var(--hbr-font-mono, monospace);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .psc-toggle-btn:hover {
        background: #1e293b;
        border-color: #06b6d4;
        color: #06b6d4;
        box-shadow: 0 0 10px rgba(6, 182, 212, 0.15);
      }
      .psc-toggle-btn.active {
        background: rgba(6, 182, 212, 0.1);
        border-color: #06b6d4;
        color: #38bdf8;
      }
      .psc-toggle-arrow {
        font-size: 10px;
        transition: transform 0.2s ease;
      }
      .psc-toggle-btn.active .psc-toggle-arrow {
        transform: rotate(180deg);
      }

      /* Collapsible Advanced Containers */
      .psc-advanced-box {
        display: none;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border: 1px solid #1e293b;
        border-radius: 2px;
        background: #090d16;
      }
      .psc-advanced-box.open {
        display: flex;
      }

      /* Fields & Inputs */
      .psc-field-group { margin: 0; }
      .psc-field-label {
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        margin: 0 0 4px 0;
        display: block;
        font-family: var(--hbr-font-mono, monospace);
        letter-spacing: 0.02em;
      }

      .psc-field-group input,
      .psc-field-group select,
      .psc-dropdown-input {
        width: 100%;
        padding: 7px 10px;
        border: 1px solid #1e293b !important;
        border-radius: 2px !important;
        font-size: 12px;
        font-family: var(--hbr-font-mono, monospace) !important;
        color: #f8fafc !important;
        background: #020617 !important;
        outline: none;
        transition: all 0.15s;
      }
      .psc-field-group input:focus,
      .psc-field-group select:focus,
      .psc-dropdown-input:focus {
        border-color: #06b6d4 !important;
        box-shadow: 0 0 8px rgba(6, 182, 212, 0.25) !important;
      }
      .psc-field-group input::placeholder { color: #475569; }

      /* Dropdown lists */
      .psc-dropdown-wrapper { position: relative; width: 100%; }
      .psc-dropdown-list {
        position: absolute; top: calc(100% + 2px); left: 0; right: 0; background: #0f172a;
        border: 1px solid #06b6d4;
        border-radius: 2px; max-height: 200px; overflow-y: auto; z-index: 100;
        display: none; list-style: none; margin: 0; padding: 4px 0;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      }
      .psc-dropdown-list li {
        padding: 7px 10px; font-size: 11px; cursor: pointer;
        color: #cbd5e1; font-family: var(--hbr-font-mono, monospace);
        transition: background 0.1s;
      }
      .psc-dropdown-list li:hover { background: rgba(6, 182, 212, 0.15); color: #06b6d4; }

      /* Form Footer Actions */
      #psc-form-footer {
        padding: 12px 18px;
        border-bottom: 1px solid #1e293b;
      }
      #psc-form-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
      }
      #psc-reset-btn {
        background: transparent;
        border: 1px solid #1e293b;
        color: #64748b;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        padding: 7px 14px;
        border-radius: 2px;
        font-family: var(--hbr-font-mono, monospace);
        text-transform: uppercase;
        transition: all 0.15s;
      }
      #psc-reset-btn:hover { color: #cbd5e1; border-color: #334155; background: #0f172a; }
      #psc-run-btn {
        background: linear-gradient(135deg, #0891b2 0%, #0284c7 100%);
        color: #f8fafc;
        border: 1px solid #06b6d4;
        border-radius: 2px;
        padding: 7px 22px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
        font-family: var(--hbr-font-mono, monospace);
        transition: all 0.15s;
        box-shadow: 0 0 12px rgba(6, 182, 212, 0.3);
      }
      #psc-run-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #06b6d4 0%, #0369a1 100%);
        box-shadow: 0 0 16px rgba(6, 182, 212, 0.5);
      }
      #psc-run-btn:disabled { background: #1e293b; border-color: #334155; color: #475569; box-shadow: none; cursor: not-allowed; }
      #psc-form-error { font-size: 11px; color: #f87171; min-height: 16px; margin-bottom: 6px; font-family: var(--hbr-font-mono, monospace); }

      /* Results Area */
      #psc-result-col {
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
      }
      #psc-result-placeholder {
        color: #475569;
        font-size: 11px;
        text-align: center;
        padding: 18px;
        background: #020617;
        border: 1px dashed #1e293b;
        border-radius: 2px;
        font-family: var(--hbr-font-mono, monospace);
      }

      /* Hero Decision Card */
      .psc-hero-card {
        border-radius: 2px;
        overflow: hidden;
        background: #0f172a;
        border: 1px solid #1e293b;
        box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      }
      .psc-hero-banner {
        padding: 12px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .psc-hero-allow {
        background: rgba(16, 185, 129, 0.12);
        border-bottom: 1px solid rgba(16, 185, 129, 0.3);
      }
      .psc-hero-block {
        background: rgba(239, 68, 68, 0.12);
        border-bottom: 1px solid rgba(239, 68, 68, 0.3);
      }
      .psc-hero-isolate {
        background: rgba(139, 92, 246, 0.12);
        border-bottom: 1px solid rgba(139, 92, 246, 0.3);
      }
      .psc-hero-unknown {
        background: #0f172a;
        border-bottom: 1px solid #1e293b;
      }

      .psc-hero-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .psc-hero-rule-title {
        font-size: 13px;
        font-weight: 700;
        color: #f8fafc;
      }
      .psc-hero-rule-sub {
        font-size: 10.5px;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: var(--hbr-font-mono, monospace);
      }

      .psc-hero-action-badge {
        font-size: 11px;
        font-weight: 800;
        padding: 4px 12px;
        border-radius: 2px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-family: var(--hbr-font-mono, monospace);
      }
      .psc-hero-allow .psc-hero-action-badge { background: #10b981; color: #070a12; box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); }
      .psc-hero-block .psc-hero-action-badge { background: #ef4444; color: #fff; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); }
      .psc-hero-isolate .psc-hero-action-badge { background: #8b5cf6; color: #fff; box-shadow: 0 0 10px rgba(139, 92, 246, 0.4); }

      .psc-hero-body { padding: 12px 14px; }
      .psc-summary-box {
        background: #020617;
        border: 1px solid #1e293b;
        border-radius: 2px;
        padding: 8px 12px;
        font-size: 11px;
        color: #38bdf8;
        margin-bottom: 10px;
        font-family: var(--hbr-font-mono, monospace);
      }

      .psc-result-details { margin-top: 4px; }
      .psc-result-details summary {
        font-size: 11px;
        font-weight: 700;
        color: #06b6d4;
        cursor: pointer;
        padding: 4px 0;
        user-select: none;
        list-style: none;
        font-family: var(--hbr-font-mono, monospace);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .psc-result-details summary::-webkit-details-marker { display: none; }
      .psc-result-details[open] summary { margin-bottom: 8px; }

      /* Technical Matrix Grid */
      .psc-result-fields {
        display: flex;
        flex-direction: column;
        border: 1px solid #1e293b;
        border-radius: 2px;
        overflow: hidden;
        background: #020617;
      }
      .psc-result-field-row {
        display: grid;
        grid-template-columns: 100px 1fr;
        gap: 8px;
        padding: 6px 10px;
        font-size: 11px;
        border-bottom: 1px solid #0f172a;
        font-family: var(--hbr-font-mono, monospace);
      }
      .psc-result-field-row:last-child { border-bottom: none; }
      .psc-result-field-label {
        color: #64748b;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 10px;
      }
      .psc-result-field-value { color: #e2e8f0; word-break: break-word; }
      .psc-result-field-value.psc-field-any { color: #475569; font-style: italic; }

      .psc-no-match-card {
        border: 1px solid #1e293b;
        border-radius: 2px;
        padding: 12px 14px;
        background: #0f172a;
        font-size: 11px;
        color: #f59e0b;
        font-family: var(--hbr-font-mono, monospace);
      }

      /* Rules Filter Bar */
      .psc-rules-filter-bar {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
      }
      .psc-search-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #1e293b;
        border-radius: 2px;
        font-size: 11px;
        font-family: var(--hbr-font-mono, monospace);
        outline: none;
        background: #020617;
        color: #f8fafc;
        transition: border-color 0.2s;
      }
      .psc-search-input:focus {
        border-color: #06b6d4;
        box-shadow: 0 0 8px rgba(6, 182, 212, 0.25);
      }
      .psc-filter-pills {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .psc-filter-pill {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 2px;
        padding: 4px 10px;
        font-size: 10.5px;
        font-weight: 700;
        color: #64748b;
        cursor: pointer;
        font-family: var(--hbr-font-mono, monospace);
        text-transform: uppercase;
        transition: all 0.15s;
      }
      .psc-filter-pill:hover {
        background: #1e293b;
        color: #cbd5e1;
      }
      .psc-filter-pill.active {
        background: rgba(6, 182, 212, 0.15);
        color: #06b6d4;
        border-color: #06b6d4;
      }

      /* Futuristic HUD Rule Cards */
      .psc-rule-group {
        border: 1px solid #1e293b;
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 6px;
        background: #0f172a;
        transition: border-color 0.15s;
        position: relative;
      }
      .psc-rule-group:hover {
        border-color: #334155;
      }
      .psc-rule-group-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px;
        cursor: pointer;
        background: #0f172a;
        list-style: none;
        user-select: none;
      }
      .psc-rule-group-header::-webkit-details-marker { display: none; }

      .psc-rule-top-line {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }
      .psc-rule-prio {
        font-family: var(--hbr-font-mono, monospace);
        font-size: 10px;
        font-weight: 700;
        color: #06b6d4;
        background: rgba(6, 182, 212, 0.1);
        border: 1px solid rgba(6, 182, 212, 0.2);
        padding: 1px 5px;
        border-radius: 2px;
      }
      .psc-rule-name {
        flex: 1;
        font-weight: 700;
        font-size: 12px;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .psc-rule-action-pill {
        font-family: var(--hbr-font-mono, monospace);
        font-size: 10px;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 2px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .psc-action-allow { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
      .psc-action-block { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
      .psc-action-isolate { background: rgba(139, 92, 246, 0.2); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.4); }

      /* Inline Data Bar on Rules */
      .psc-inline-chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        font-family: var(--hbr-font-mono, monospace);
        font-size: 10px;
      }
      .psc-chip {
        background: #020617;
        border: 1px solid #1e293b;
        border-radius: 2px;
        padding: 2px 6px;
        color: #94a3b8;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .psc-chip-key { color: #64748b; font-weight: 700; }
      .psc-chip-val { color: #38bdf8; }

      .psc-check-list { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: #070a12; border-top: 1px solid #1e293b; }
      .psc-check-item {
        border-left: 2px solid;
        padding: 6px 10px;
        border-radius: 2px;
        font-size: 11px;
        line-height: 1.45;
        background: #0f172a;
      }
      .psc-check-item-head {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 2px;
        font-weight: 700;
        font-size: 10.5px;
        font-family: var(--hbr-font-mono, monospace);
      }
      .psc-check-msg { color: #cbd5e1; display: block; }
      .psc-check-detail { color: #64748b; font-size: 10px; margin-top: 2px; font-family: var(--hbr-font-mono, monospace); }

      /* Tooltip */
      #psc-tooltip {
        position: fixed;
        display: none;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #06b6d4;
        padding: 8px 12px;
        border-radius: 2px;
        font-size: 11px;
        font-family: var(--hbr-font-mono, monospace);
        line-height: 1.45;
        white-space: pre-wrap;
        z-index: 99999;
        max-width: 350px;
        word-wrap: break-word;
        box-shadow: 0 0 12px rgba(6, 182, 212, 0.25);
        pointer-events: none;
      }
`;
    document.head.appendChild(s);
  }

  function el(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
      if (key === "style" && typeof val === "object") {
        Object.assign(element.style, val);
      } else if (key === "htmlFor") {
        element.setAttribute("for", val);
      } else if (key.startsWith("on") && typeof val === "function") {
        element.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (val !== null && val !== undefined) {
        element.setAttribute(key, val);
      }
    }
    for (const child of children) {
      if (typeof child === "string" || typeof child === "number") {
        element.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    }
    return element;
  }

  function showTooltip(evt, content) {
    let t = document.getElementById("psc-tooltip");
    if (!t) {
      t = el("div", { id: "psc-tooltip" });
      document.body.appendChild(t);
    }
    t.textContent = content;
    t.style.display = "block";
    positionTooltip(evt);
  }

  function positionTooltip(evt) {
    const t = document.getElementById("psc-tooltip");
    if (!t) return;
    const x = evt.clientX + 12;
    const y = evt.clientY + 12;
    t.style.left = `${Math.min(x, window.innerWidth - 360)}px`;
    t.style.top = `${Math.min(y, window.innerHeight - 100)}px`;
  }

  function hideTooltip() {
    const t = document.getElementById("psc-tooltip");
    if (t) t.style.display = "none";
  }

  function addTooltip(element, content) {
    if (!content) return;
    element.addEventListener("mouseenter", (e) => showTooltip(e, content));
    element.addEventListener("mousemove", positionTooltip);
    element.addEventListener("mouseleave", hideTooltip);
  }

  function createSearchableSelect(labelStr, hintStr, inputId, itemsObj) {
    const wrapper = el("div", { class: "psc-dropdown-wrapper" });
    const input = el("input", {
      id: inputId,
      type: "text",
      class: "psc-dropdown-input",
      placeholder: hintStr || "Type to search...",
      autocomplete: "off",
    });
    input.disabled = true;

    const list = el("ul", { class: "psc-dropdown-list" });
    let selectedValue = "";

    const keys = Object.keys(itemsObj || {});

    function renderList(query) {
      list.innerHTML = "";
      const q = (query || "").toLowerCase();
      const matches = keys.filter(k => {
        const label = itemsObj[k] || "";
        return k.toLowerCase().includes(q) || label.toLowerCase().includes(q);
      }).slice(0, 50);

      if (matches.length === 0) {
        list.appendChild(el("li", { style: { color: "#64748b", cursor: "default" } }, ["No matches found"]));
        return;
      }

      matches.forEach(k => {
        const label = itemsObj[k] || k;
        const li = el("li", {}, [
          label
        ]);
        li.addEventListener("click", () => {
          selectedValue = k;
          input.value = label;
          list.style.display = "none";
        });
        list.appendChild(li);
      });
    }

    input.addEventListener("focus", () => {
      renderList(input.value);
      list.style.display = "block";
    });

    input.addEventListener("input", () => {
      selectedValue = "";
      renderList(input.value);
      list.style.display = "block";
    });

    document.addEventListener("click", (evt) => {
      if (!wrapper.contains(evt.target)) {
        list.style.display = "none";
      }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(list);

    const container = el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: inputId }, [labelStr]),
      wrapper
    ]);

    return {
      element: container,
      wrapper,
      input,
      getValue: () => selectedValue || input.value.trim(),
      reset: () => {
        selectedValue = "";
        input.value = "";
      }
    };
  }

  function buildTesterPanel(container, identityOptions, objectMaps, identityTypeMap, identityMap, onRun, onReset) {
    injectStyles();

    const maps = objectMaps && objectMaps.privateResources ? objectMaps : {
      privateResources: objectMaps || {},
      destinationLists: {},
      networkObjects: {},
      serviceObjectGroups: {},
      applicationLists: {},
      categoryLists: {},
    };

    const panel = el("div", { id: "psc-panel" });

    panel.appendChild(el("div", { id: "psc-panel-title" }, ["SIMULATE TRAFFIC MATCH"]));
    panel.appendChild(el("div", { id: "psc-panel-desc" }, [
      "Default mode evaluates Source/Destination IP:Port. Toggle advanced criteria to expand Identity or App filters."
    ]));

    const body = el("div", { id: "psc-panel-body" });
    const formRow = el("div", { id: "psc-form-row" });

    // --- 1. DEFAULT PRIMARY CARD: Source IP:Port + Destination IP:Port ---
    const primaryCard = el("div", { class: "psc-hud-card" });
    primaryCard.appendChild(el("div", { class: "psc-hud-title" }, [
      el("span", {}, ["PRIMARY IP / PORT CRITERIA"]),
      el("span", { style: { fontSize: "9px", color: "#06b6d4" } }, ["[DEFAULT ACTIVE]"])
    ]));

    // Source IP:Port Input
    const sourceInput = el("input", {
      id: "psc-src",
      type: "text",
      placeholder: "192.168.1.50:443 or CIDR (e.g. 10.0.0.0/16)",
      autocomplete: "off",
    });
    primaryCard.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-src" }, ["SOURCE IP / CIDR / PORT"]),
      sourceInput,
    ]));

    // Destination IP:Port Input
    const destInput = el("input", {
      id: "psc-dest",
      type: "text",
      placeholder: "10.0.0.1:80 or Domain (e.g. cisco.com:443)",
      autocomplete: "off",
    });
    primaryCard.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-dest" }, ["DESTINATION IP / DOMAIN / PORT"]),
      destInput,
    ]));

    formRow.appendChild(primaryCard);

    // --- 2. TOGGLEABLE ADVANCED SOURCE CRITERIA ---
    const srcAdvToggle = el("button", { type: "button", class: "psc-toggle-btn", id: "psc-toggle-src-adv" }, [
      el("span", {}, ["⚙️ [ + ADVANCED SOURCE CRITERIA ]"]),
      el("span", { class: "psc-toggle-arrow" }, ["▼"])
    ]);

    const srcAdvBox = el("div", { class: "psc-advanced-box", id: "psc-src-adv-box" });

    // Identity Select
    const identityItems = {};
    if (Array.isArray(identityOptions)) {
      identityOptions.forEach(id => {
        const label = identityMap && identityMap[id] ? identityMap[id] : id;
        identityItems[id] = label;
      });
    }
    const identitySelect = createSearchableSelect("Identity", "Search AD group, user, or device...", "psc-identity", identityItems);
    identitySelect.input.disabled = false;
    srcAdvBox.appendChild(identitySelect.element);

    const identityTypeSelect = createSearchableSelect("Identity Type", "Search identity types...", "psc-identity-type", identityTypeMap || {});
    identityTypeSelect.input.disabled = false;
    srcAdvBox.appendChild(identityTypeSelect.element);

    const sgtInput = el("input", { id: "psc-sgt", type: "text", placeholder: "SGT Tag / ID", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-sgt" }, ["Security Group Tag (SGT)"]),
      sgtInput
    ]));

    const locInput = el("input", { id: "psc-location", type: "text", placeholder: "Location / Branch name or ID", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-location" }, ["Location / Branch"]),
      locInput
    ]));

    const intNetInput = el("input", { id: "psc-internal-net", type: "text", placeholder: "Internal Network Range", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-internal-net" }, ["Internal Network"]),
      intNetInput
    ]));

    const srcNetObjSelect = createSearchableSelect("Source Network Object", "Search network objects...", "psc-netobj-src", maps.networkObjects || {});
    srcNetObjSelect.input.disabled = false;
    srcAdvBox.appendChild(srcNetObjSelect.element);

    const tunnelInput = el("input", { id: "psc-tunnel", type: "text", placeholder: "Tunnel name or ID", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-tunnel" }, ["Network Tunnel"]),
      tunnelInput
    ]));

    const postureInput = el("input", { id: "psc-posture", type: "text", placeholder: "Device Posture Profile", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-posture" }, ["Device Posture Profile"]),
      postureInput
    ]));

    const netDevInput = el("input", { id: "psc-network-device", type: "text", placeholder: "Network Device hostname/IP", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-network-device" }, ["Network Device"]),
      netDevInput
    ]));

    srcAdvToggle.addEventListener("click", () => {
      srcAdvToggle.classList.toggle("active");
      srcAdvBox.classList.toggle("open");
    });

    formRow.appendChild(srcAdvToggle);
    formRow.appendChild(srcAdvBox);

    // --- 3. TOGGLEABLE ADVANCED DESTINATION CRITERIA ---
    const dstAdvToggle = el("button", { type: "button", class: "psc-toggle-btn", id: "psc-toggle-dst-adv" }, [
      el("span", {}, ["⚙️ [ + ADVANCED DESTINATION CRITERIA ]"]),
      el("span", { class: "psc-toggle-arrow" }, ["▼"])
    ]);

    const dstAdvBox = el("div", { class: "psc-advanced-box", id: "psc-dst-adv-box" });

    const appSelect = createSearchableSelect("Internet Application", "Search applications...", "psc-app", {});
    const protoSelect = createSearchableSelect("Application Protocol", "Search protocols...", "psc-proto", {});
    const catSelect = createSearchableSelect("Content Category", "Search categories...", "psc-cat", {});
    const privResSelect = createSearchableSelect("Private Resource", "Search private resources...", "psc-privres", maps.privateResources || {});
    privResSelect.input.disabled = false;

    const destListSelect = createSearchableSelect("Destination List", "Search destination lists...", "psc-destlist", maps.destinationLists || {});
    destListSelect.input.disabled = false;

    const netObjSelect = createSearchableSelect("Network Object", "Search network objects...", "psc-netobj", maps.networkObjects || {});
    netObjSelect.input.disabled = false;

    const svcObjSelect = createSearchableSelect("Service Object Group", "Search service groups...", "psc-svcobj", maps.serviceObjectGroups || {});
    svcObjSelect.input.disabled = false;

    const appListSelect = createSearchableSelect("Application List", "Search application lists...", "psc-applist", maps.applicationLists || {});
    appListSelect.input.disabled = false;

    const catListSelect = createSearchableSelect("Category List", "Search category lists...", "psc-catlist", maps.categoryLists || {});
    catListSelect.input.disabled = false;

    dstAdvBox.appendChild(appSelect.element);
    dstAdvBox.appendChild(protoSelect.element);
    dstAdvBox.appendChild(catSelect.element);
    dstAdvBox.appendChild(privResSelect.element);
    dstAdvBox.appendChild(destListSelect.element);
    dstAdvBox.appendChild(netObjSelect.element);
    dstAdvBox.appendChild(svcObjSelect.element);
    dstAdvBox.appendChild(appListSelect.element);
    dstAdvBox.appendChild(catListSelect.element);

    dstAdvToggle.addEventListener("click", () => {
      dstAdvToggle.classList.toggle("active");
      dstAdvBox.classList.toggle("open");
    });

    formRow.appendChild(dstAdvToggle);
    formRow.appendChild(dstAdvBox);
    body.appendChild(formRow);

    // Asynchronously populate lookups
    loadLookups().then(lookups => {
      const newAppSelect = createSearchableSelect("Internet Application", "Search applications...", "psc-app", lookups.apps);
      const newProtoSelect = createSearchableSelect("Application Protocol", "Search protocols...", "psc-proto", lookups.protocols);
      const newCatSelect = createSearchableSelect("Content Category", "Search categories...", "psc-cat", lookups.categories);
      
      newAppSelect.input.disabled = false;
      newProtoSelect.input.disabled = false;
      newCatSelect.input.disabled = false;
      
      appSelect.getValue = newAppSelect.getValue;
      protoSelect.getValue = newProtoSelect.getValue;
      catSelect.getValue = newCatSelect.getValue;
      appSelect.reset = newAppSelect.reset;
      protoSelect.reset = newProtoSelect.reset;
      catSelect.reset = newCatSelect.reset;
    });

    // Footer actions
    const formFooter = el("div", { id: "psc-form-footer" });
    const errorLine = el("p", { id: "psc-form-error" });
    formFooter.appendChild(errorLine);

    const runBtn   = el("button", { id: "psc-run-btn",   type: "button" }, ["RUN SIMULATION"]);
    const resetBtn = el("button", { id: "psc-reset-btn", type: "button" }, ["RESET"]);
    formFooter.appendChild(el("div", { id: "psc-form-actions" }, [resetBtn, runBtn]));

    body.appendChild(formFooter);

    // Results container
    const resultCol = el("div", { id: "psc-result-col" });
    const placeholder = el("div", { id: "psc-result-placeholder" }, [
      "// ENTER CRITERIA ABOVE AND CLICK RUN SIMULATION"
    ]);
    resultCol.appendChild(placeholder);
    body.appendChild(resultCol);

    panel.appendChild(body);
    container.appendChild(panel);

    function updateResult(result) {
      resultCol.innerHTML = "";

      if (!result) {
        resultCol.appendChild(el("div", { id: "psc-result-placeholder" }, [
          "// ENTER CRITERIA ABOVE AND CLICK RUN SIMULATION"
        ]));
        return;
      }

      if (result === "NO_MATCH") {
        resultCol.appendChild(el("div", { class: "psc-no-match-card" }, [
          el("span", {}, ["⚠️ NO SPECIFIC RULE MATCHED — DEFAULT POLICY ACTION APPLIES."]),
        ]));
        return;
      }

      const { rule, matchedConditions, matchFields } = result;
      const displayName   = rule.ruleName   || rule.name   || "(unnamed)";
      const displayAction = rule.ruleAction || rule.action || "unknown";
      const displayPrio   = rule.rulePriority !== undefined ? rule.rulePriority : rule.order;

      const actionKey  = displayAction.toLowerCase();
      const bannerCls  = actionKey === "allow"   ? "psc-hero-allow"
                       : actionKey === "block"   ? "psc-hero-block"
                       : actionKey === "isolate" ? "psc-hero-isolate"
                       : "psc-hero-unknown";

      const heroBanner = el("div", { class: `psc-hero-banner ${bannerCls}` }, [
        el("div", { class: "psc-hero-info" }, [
          el("div", { class: "psc-hero-rule-title" }, [displayName]),
          el("div", { class: "psc-hero-rule-sub" }, [
            el("span", {}, [`[ PRIORITY #${displayPrio} ]`]),
            rule.logging_enabled ? el("span", {}, ["• LOGS: ENABLED"]) : null,
          ].filter(Boolean)),
        ]),
        el("div", { class: "psc-hero-action-badge" }, [displayAction]),
      ]);

      function fieldRow(field) {
        const rowCls   = field.constrained ? "psc-result-field-row" : "psc-result-field-row psc-field-unconstrained";
        const valueCls = field.constrained ? "psc-result-field-value" : "psc-result-field-value psc-field-any";
        return el("div", { class: rowCls }, [
          el("div", { class: "psc-result-field-label" }, [field.label]),
          el("div", { class: valueCls }, [field.display]),
        ]);
      }

      const matchedGrid = matchFields
        ? el("div", { class: "psc-result-fields" }, [
            fieldRow(matchFields.source),
            fieldRow(matchFields.identity),
            fieldRow(matchFields.destination),
            fieldRow(matchFields.app),
          ])
        : el("ul", { class: "psc-result-cond-list" },
            matchedConditions.map((c) => el("li", {}, [c]))
          );

      const summaryText = matchFields
        ? `${matchFields.identity.constrained ? matchFields.identity.display : 'ANY IDENTITY'} ➔ ${matchFields.destination.constrained ? matchFields.destination.display : (matchFields.app.constrained ? matchFields.app.display : 'ANY TRAFFIC')}`
        : "MATCHED RULE CONDITIONS";

      const summaryBox = el("div", { class: "psc-summary-box" }, [
        el("strong", {}, ["MATCH REASON: "]),
        summaryText
      ]);

      const detailsElem = el("details", { class: "psc-result-details" }, [
        el("summary", {}, ["▶ VIEW FULL MATCH MATRIX & ATTRIBUTES"]),
        matchedGrid
      ]);

      const heroBody = el("div", { class: "psc-hero-body" }, [
        summaryBox,
        detailsElem
      ]);

      const heroCard = el("div", { class: "psc-hero-card" }, [
        heroBanner,
        heroBody
      ]);

      resultCol.appendChild(heroCard);
    }

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

      const sgtVal = sgtInput.value.trim();
      const locVal = locInput.value.trim();
      const intNetVal = intNetInput.value.trim();
      const srcNetObjId = srcNetObjSelect.getValue();
      const tunnelVal = tunnelInput.value.trim();
      const postureVal = postureInput.value.trim();
      const netDevVal = netDevInput.value.trim();

      if (!srcVal && !destVal && !appId && !protoId && !catId && !identityVal && !identityTypeIdVal && !privResId && !destListId && !netObjId && !svcObjId && !appListId && !catListId && !sgtVal && !locVal && !intNetVal && !srcNetObjId && !tunnelVal && !postureVal && !netDevVal) {
        errorLine.textContent = "SELECT AT LEAST ONE CRITERION.";
        return;
      }

      const srcParsed = parseIpInput(srcVal, "Source");
      const destParsed = parseIpInput(destVal, "Destination");

      errorLine.textContent = "";
      runBtn.disabled = true;
      runBtn.textContent = "SIMULATING…";
      
      const testInput = {
        source:                srcParsed.ipCidr,
        sourcePort:            srcParsed.port,
        identity:              identityVal,
        identityTypeId:        identityTypeIdVal,
        sgt:                   sgtVal,
        location:              locVal,
        internalNetwork:       intNetVal,
        sourceNetworkObjectId: srcNetObjId,
        tunnel:                tunnelVal,
        posture:               postureVal,
        networkDevice:         netDevVal,
        applicationId:         appId,
        protocolId:            protoId,
        categoryId:            catId,
        destination:           destParsed.ipCidr,
        destinationPort:       destParsed.port,
        privateResourceId:     privResId,
        destinationListId:     destListId,
        networkObjectId:       netObjId,
        serviceObjectGroupId:  svcObjId,
        applicationListId:     appListId,
        categoryListId:        catListId,
      };

      setTimeout(() => {
        Promise.resolve(onRun(testInput)).finally(() => {
          runBtn.disabled = false;
          runBtn.textContent = "RUN SIMULATION";
        });
      }, 0);
    });

    resetBtn.addEventListener("click", () => {
      sourceInput.value = "";
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
      srcNetObjSelect.reset();
      sgtInput.value = "";
      locInput.value = "";
      intNetInput.value = "";
      tunnelInput.value = "";
      postureInput.value = "";
      netDevInput.value = "";
      destInput.value = "";
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

  function buildRulesList(container) {
    injectStyles();

    const root = el("div", { id: "psc-rules-list-root", style: { display: "flex", flexDirection: "column", gap: "10px", padding: "14px 18px" } });
    container.appendChild(root);

    const filterBar = el("div", { class: "psc-rules-filter-bar" });
    const searchInput = el("input", {
      type: "text",
      class: "psc-search-input",
      placeholder: "// SEARCH RULES BY NAME, IDENTITY, DESTINATION, OR APP...",
      autocomplete: "off",
    });

    const pillsContainer = el("div", { class: "psc-filter-pills" });
    const filterOptions = [
      { id: "all", label: "[ ALL ]" },
      { id: "allow", label: "[ PERMIT ]" },
      { id: "block", label: "[ DENY ]" },
      { id: "private", label: "[ PRIVATE ACCESS ]" },
      { id: "internet", label: "[ INTERNET ACCESS ]" },
    ];

    let activeFilter = "all";
    filterOptions.forEach(opt => {
      const pill = el("button", {
        type: "button",
        class: opt.id === "all" ? "psc-filter-pill active" : "psc-filter-pill",
        "data-filter": opt.id
      }, [opt.label]);

      pill.addEventListener("click", () => {
        pillsContainer.querySelectorAll(".psc-filter-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeFilter = opt.id;
        applyRulesFilter();
      });

      pillsContainer.appendChild(pill);
    });

    filterBar.appendChild(searchInput);
    filterBar.appendChild(pillsContainer);
    root.appendChild(filterBar);

    const rulesContainer = el("div", { id: "psc-rules-cards-container", style: { display: "flex", flexDirection: "column", gap: "6px" } });
    root.appendChild(rulesContainer);

    function applyRulesFilter() {
      const query = searchInput.value.toLowerCase().trim();
      const cards = rulesContainer.querySelectorAll(".psc-rule-group");
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const action = card.getAttribute("data-action") || "";
        const type = card.getAttribute("data-type") || "";

        let matchesSearch = !query || text.includes(query);
        let matchesPill = true;

        if (activeFilter === "allow") matchesPill = action === "allow";
        else if (activeFilter === "block") matchesPill = action === "block";
        else if (activeFilter === "private") matchesPill = type.includes("private");
        else if (activeFilter === "internet") matchesPill = !type.includes("private");

        card.style.display = matchesSearch && matchesPill ? "" : "none";
      });
    }

    searchInput.addEventListener("input", applyRulesFilter);

    const SEV_ORDER = ["critical", "high", "medium", "low"];

    function summarizeConditions(rule, lookups) {
      const conds = rule.ruleConditions || rule.conditions || [];
      if (!Array.isArray(conds) || conds.length === 0) {
        return [{ text: "ANY TRAFFIC", raw: null }];
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
            if (values === true) summaryText = `${type.split('.')[1].toUpperCase()} = ANY`;
            break;
          case "umbrella.source.identity_ids": {
            const identityNames = (Array.isArray(values) ? values : [values]).map((id) => {
              return (lookups.identities && lookups.identities[String(id)]) || id;
            });
            summaryText = `ID: ${identityNames.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_ids": {
            const appMatches = [];
            for (const id of Array.isArray(values) ? values : []) {
              if (lookups.apps[id] !== undefined) appMatches.push(lookups.apps[id]);
              else if (lookups.protocols[id] !== undefined) appMatches.push(lookups.protocols[id]);
              else appMatches.push(id);
            }
            summaryText = `APP: ${appMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.composite_inline_ip": {
            const items = Array.isArray(values) ? values : [values];
            const parts = items.map((item) => {
              if (item && typeof item === "object") {
                const ip = Array.isArray(item.ip) ? item.ip.join(",") : (item.ip || "*");
                const port = Array.isArray(item.port) ? item.port.join(",") : (item.port || "*");
                return `${ip}:${port}`;
              }
              return String(item);
            });
            summaryText = `DST IP: ${parts.join(" + ")}`;
            break;
          }
          default: {
            const simple = type.replace("umbrella.", "").replace("destination.", "").replace("source.", "");
            summaryText = `${simple.toUpperCase()}: ${Array.isArray(values) ? values.join(",") : values}`;
            break;
          }
        }
        if (summaryText) summaries.push({ text: summaryText, raw: c });
      }
      return summaries;
    }

    async function update(rules, findings, identityMap, objectMap, objectMaps, identityTypeMap) {
      const lookups = await loadLookups();
      lookups.identities = identityMap || {};
      lookups.identityTypes = identityTypeMap || {};
      lookups.objects = objectMap || {};
      lookups.privateResources = (objectMaps && objectMaps.privateResources) || objectMap || {};
      lookups.destinationLists = (objectMaps && objectMaps.destinationLists) || {};
      lookups.networkObjects   = (objectMaps && objectMaps.networkObjects) || {};

      rulesContainer.innerHTML = "";
      if (!rules || rules.length === 0) {
        rulesContainer.appendChild(el("p", { class: "psc-empty", style: { textAlign: "center", color: "#64748b", fontFamily: "var(--hbr-font-mono)" } }, ["// NO RULES LOADED"]));
        return;
      }

      const findingsByRule = new Map();
      for (const f of findings || []) {
        if (!findingsByRule.has(f.ruleId)) findingsByRule.set(f.ruleId, []);
        findingsByRule.get(f.ruleId).push(f);
      }

      for (const rule of rules) {
        const rName = rule.ruleName || rule.name || "(unnamed)";
        const rAction = (rule.ruleAction || rule.action || "allow").toLowerCase();
        const rPrio = rule.rulePriority !== undefined ? rule.rulePriority : rule.order;
        const rId = rule.ruleId !== undefined ? rule.ruleId : rule.id;
        const ruleFindings = findingsByRule.get(rId) || [];

        const card = el("details", {
          class: "psc-rule-group",
          "data-action": rAction,
          "data-type": (rule.type || "").toLowerCase(),
          style: { borderLeft: `3px solid ${rAction === "allow" ? "#10b981" : (rAction === "block" ? "#ef4444" : "#8b5cf6")}` }
        });

        const condSummaries = summarizeConditions(rule, lookups);

        // Header Top Line
        const actionCls = rAction === "allow" ? "psc-action-allow" : (rAction === "block" ? "psc-action-block" : "psc-action-isolate");
        const topBar = el("div", { class: "psc-rule-top-line" }, [
          el("span", { class: "psc-rule-prio" }, [`#${rPrio}`]),
          el("span", { class: "psc-rule-name" }, [rName]),
          el("span", { class: `psc-rule-action-pill ${actionCls}` }, [rAction.toUpperCase()]),
        ]);

        // Inline Data Chips Bar
        const inlineChips = el("div", { class: "psc-inline-chips" });
        condSummaries.slice(0, 3).forEach(cs => {
          const colonIdx = cs.text.indexOf(":");
          if (colonIdx > -1) {
            inlineChips.appendChild(el("span", { class: "psc-chip" }, [
              el("span", { class: "psc-chip-key" }, [cs.text.slice(0, colonIdx)]),
              el("span", { class: "psc-chip-val" }, [cs.text.slice(colonIdx + 1)]),
            ]));
          } else {
            inlineChips.appendChild(el("span", { class: "psc-chip" }, [
              el("span", { class: "psc-chip-val" }, [cs.text]),
            ]));
          }
        });

        const header = el("summary", { class: "psc-rule-group-header" }, [
          topBar,
          inlineChips
        ]);

        card.appendChild(header);

        // Card Body
        const cardBody = el("div", { class: "psc-check-list" });

        // Security Profile Chips
        if (rule.security_profiles) {
          const sp = rule.security_profiles;
          const spRow = el("div", { class: "psc-inline-chips", style: { marginBottom: "6px" } }, [
            el("span", { class: "psc-chip", style: { borderColor: sp.ips_enabled ? "#10b981" : "#334155" } }, [`IPS: ${sp.ips_enabled ? "ON" : "OFF"}`]),
            el("span", { class: "psc-chip", style: { borderColor: sp.amp_malware_enabled ? "#10b981" : "#334155" } }, [`AMP: ${sp.amp_malware_enabled ? "ON" : "OFF"}`]),
            el("span", { class: "psc-chip", style: { borderColor: sp.tls_decryption_enabled ? "#10b981" : "#334155" } }, [`TLS: ${sp.tls_decryption_enabled ? "ON" : "OFF"}`]),
            el("span", { class: "psc-chip", style: { borderColor: sp.dlp_enabled ? "#10b981" : "#334155" } }, [`DLP: ${sp.dlp_enabled ? "ON" : "OFF"}`]),
          ]);
          cardBody.appendChild(spRow);
        }

        // Findings
        if (ruleFindings.length > 0) {
          const findingsBox = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } });
          ruleFindings.forEach(f => {
            const fc = COLOR[f.severity] || COLOR.low;
            findingsBox.appendChild(el("div", { class: "psc-check-item", style: { borderLeftColor: fc.bg } }, [
              el("div", { class: "psc-check-item-head", style: { color: fc.border } }, [`[${f.checkId}] ${f.severity.toUpperCase()}`]),
              el("span", { class: "psc-check-msg" }, [f.message])
            ]));
          });
          cardBody.appendChild(findingsBox);
        }

        card.appendChild(cardBody);
        rulesContainer.appendChild(card);
      }

      applyRulesFilter();
    }

    return { update };
  }

  global.PopupSections = {
    buildTesterPanel,
    buildRulesList,
    loadLookups,
    buildAuditSections:    () => ({ goodSection: { update: () => {} }, badSection: { update: () => {} }, allRulesSection: { update: () => {} } }),
    buildWillMatchSection: () => ({ section: null, update: () => {} }),
    buildGoodSection:      () => ({ section: null, update: () => {} }),
    buildBadSection:       () => ({ section: null, update: () => {} }),
    buildTesterForm:       () => null,
  };
})(window);
