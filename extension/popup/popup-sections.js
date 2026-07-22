// =============================================================================
// popup-sections.js — DOM builders for the Policy Match Tester split panel
// and the single collapsible audit-result sections.
//
// Visual design: Clean Light Mode UI with pure white background, dark slate
// typography, crisp borders, progressive disclosure controls, and human-readable
// condition chips.
//
// Exported to window.PopupSections. No browser-extension API calls.
// =============================================================================

(function (global) {
  "use strict";

  // Default fallback dictionary for identity types (matched with official Cisco API schema)
  const DEFAULT_IDENTITY_TYPES = {
    "0": "Tags",
    "1": "Networks",
    "2": "Network Devices",
    "3": "AD Groups",
    "4": "Users & AD Groups",
    "5": "AD Computers",
    "6": "Internal Networks",
    "7": "AD Users",
    "8": "SAML Users & Groups",
    "9": "Roaming Computers",
    "10": "Device Posture Profiles",
    "11": "Security Group Tags (SGT)",
    "21": "Sites",
    "32": "Network Devices",
    "34": "Posture",
    "36": "Mobile Devices",
    "37": "OS Version & Patch Level",
    "38": "Chromebooks",
    "40": "Network Tunnels",
    "43": "G Suite Users",
    "45": "G Suite OUs",
    "50": "Endpoint Requirements",
    "52": "Catalyst SD-WAN Service VPN IDs",
    "54": "Security Group Tags",
    "57": "ZTNA Client",
    "user": "Active Directory Users & Groups",
    "device": "Network Devices",
    "site": "Sites & Branches",
    "group": "Users & AD Groups",
    "roaming": "Roaming Computers",
    "internal_network": "Internal Networks",
    "tunnel": "Network Tunnels",
    "saml": "SAML Users & Groups",
    "ip_subnet": "IP Subnets / CIDR",
    "posture": "Device Posture Profiles",
    "sgt": "Security Group Tags (SGT)"
  };
  const COLOR = {
    critical: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
    high:     { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
    medium:   { bg: "#fefce8", text: "#a16207", border: "#fef08a" },
    low:      { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" },
    allow:    { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
    block:    { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
    isolate:  { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" },
    unknown:  { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" },
  };

  function injectStyles() {
    if (document.getElementById("psc-style")) return;
    const s = document.createElement("style");
    s.id = "psc-style";
    s.textContent = `
      /* ================================================================== */
      /* LIGHT MODE HUD THEME (PURE WHITE BG, DARK TEXT)                     */
      /* ================================================================== */
      #psc-panel {
        background: #ffffff;
        color: #1e293b;
        display: flex;
        flex-direction: column;
        font-family: var(--hbr-font-family);
        width: 100%;
        max-width: 100% !important;
        overflow-x: hidden !important;
        box-sizing: border-box !important;
      }

      #psc-panel-title {
        padding: 14px 18px 2px;
        font-size: 13px;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-family: var(--hbr-font-mono, monospace);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #psc-panel-desc {
        padding: 0 18px 10px;
        font-size: 11px;
        color: #64748b;
        line-height: 1.45;
        border-bottom: 1px solid #e2e8f0;
      }

      #psc-panel-body {
        display: flex;
        flex-direction: column;
        min-height: 480px;
      }

      #psc-form-row {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px 18px 0;
        width: 100%;
      }

      /* Source/Destination IP:Port Fields — no enclosing box, space-between layout */
      .psc-ip-fields-row {
        display: flex;
        gap: 16px;
        width: 100%;
      }
      .psc-ip-fields-row .psc-field-group {
        flex: 1;
        min-width: 0;
      }
      .psc-ip-fields-row .psc-field-label {
        font-size: 10.5px;
        font-weight: 700;
        color: #0f172a;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* Settings Panel (right side) */
      .psc-settings-panel {
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        padding: 12px;
        background: #f8fafc;
        margin-top: 8px;
      }
      .psc-settings-panel .psc-settings-title {
        font-size: 10px;
        font-weight: 700;
        color: #0f172a;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-family: var(--hbr-font-mono, monospace);
        margin-bottom: 8px;
      }
      .psc-settings-panel .psc-setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 11px;
        color: #1e293b;
        font-family: var(--hbr-font-mono, monospace);
      }
      .psc-settings-panel .psc-setting-row label {
        color: #475569;
        font-size: 10.5px;
      }
      .psc-settings-panel .psc-setting-toggle {
        width: 36px;
        height: 18px;
        border-radius: 9px;
        border: 1px solid #cbd5e1;
        background: #e2e8f0;
        position: relative;
        cursor: pointer;
        transition: all 0.15s;
      }
      .psc-settings-panel .psc-setting-toggle.active {
        background: #0f172a;
        border-color: #0f172a;
      }
      .psc-settings-panel .psc-setting-toggle::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ffffff;
        transition: transform 0.15s;
      }
      .psc-settings-panel .psc-setting-toggle.active::after {
        transform: translateX(18px);
      }

      /* Default Primary IP+Port Cards */
      .psc-hud-card {
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        padding: 12px 14px;
        background: #f8fafc;
        display: flex;
        flex-direction: column;
        gap: 10px;
        position: relative;
      }
      .psc-hud-card::before {
        content: "";
        position: absolute;
        top: 0; left: 0; width: 3px; bottom: 0;
        background: #0f172a;
      }

      .psc-hud-title {
        font-size: 10.5px;
        font-weight: 700;
        color: #0f172a;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: var(--hbr-font-mono, monospace);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      /* Toggle Buttons for Advanced Criteria */
      .psc-toggle-btn {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 700;
        color: #475569;
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
        background: #f1f5f9;
        border-color: #cbd5e1;
        color: #0f172a;
      }
      .psc-toggle-btn.active {
        background: #f1f5f9;
        border-color: #0f172a;
        color: #0f172a;
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
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        background: #ffffff;
      }
      .psc-advanced-box.open {
        display: flex;
      }

      /* Fields & Inputs */
      .psc-field-group { margin: 0; }
      .psc-field-label {
        font-size: 11px;
        font-weight: 600;
        color: #475569;
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
        border: 1px solid #cbd5e1 !important;
        border-radius: 2px !important;
        font-size: 12px;
        font-family: var(--hbr-font-mono, monospace) !important;
        color: #0f172a !important;
        background: #ffffff !important;
        outline: none;
        transition: all 0.15s;
      }
      .psc-field-group input:focus,
      .psc-field-group select:focus,
      .psc-dropdown-input:focus {
        border-color: #0f172a !important;
        box-shadow: 0 0 0 1px #0f172a !important;
      }
      .psc-field-group input::placeholder { color: #94a3b8; }

      /* Dropdown lists */
      .psc-dropdown-wrapper { position: relative; width: 100%; }
      .psc-dropdown-list {
        position: absolute; top: calc(100% + 2px); left: 0; right: 0; background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 2px; max-height: 200px; overflow-y: auto; z-index: 100;
        display: none; list-style: none; margin: 0; padding: 4px 0;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
      }
      .psc-dropdown-list li {
        padding: 7px 10px; font-size: 11px; cursor: pointer;
        color: #1e293b; font-family: var(--hbr-font-mono, monospace);
        transition: background 0.1s;
      }
      .psc-dropdown-list li:hover { background: #f1f5f9; color: #0f172a; }

      /* Form Footer Actions */
      #psc-form-footer {
        padding: 12px 18px;
        border-bottom: 1px solid #e2e8f0;
      }
      #psc-form-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
      }
      #psc-reset-btn {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #475569;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        padding: 7px 14px;
        border-radius: 2px;
        font-family: var(--hbr-font-mono, monospace);
        text-transform: uppercase;
        transition: all 0.15s;
      }
      #psc-reset-btn:hover { color: #0f172a; border-color: #94a3b8; background: #f8fafc; }
      #psc-run-btn {
        background: #0f172a;
        color: #ffffff;
        border: 1px solid #0f172a;
        border-radius: 2px;
        padding: 7px 22px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
        font-family: var(--hbr-font-mono, monospace);
        transition: all 0.15s;
      }
      #psc-run-btn:hover:not(:disabled) {
        background: #1e293b;
        border-color: #1e293b;
      }
      #psc-run-btn:disabled { background: #e2e8f0; border-color: #cbd5e1; color: #94a3b8; cursor: not-allowed; }
      #psc-form-error { font-size: 11px; color: #b91c1c; min-height: 16px; margin-bottom: 6px; font-family: var(--hbr-font-mono, monospace); }

      /* Results Area */
      #psc-result-col {
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
      }
      #psc-result-placeholder {
        color: #64748b;
        font-size: 11px;
        text-align: center;
        padding: 18px;
        background: #f8fafc;
        border: 1px dashed #cbd5e1;
        border-radius: 2px;
        font-family: var(--hbr-font-mono, monospace);
      }

      /* Hero Decision Card */
      .psc-hero-card {
        border-radius: 2px;
        overflow: hidden;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
      }
      .psc-hero-banner {
        padding: 12px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .psc-hero-allow {
        background: #f0fdf4;
        border-bottom: 1px solid #bbf7d0;
      }
      .psc-hero-block {
        background: #fef2f2;
        border-bottom: 1px solid #fecaca;
      }
      .psc-hero-isolate {
        background: #faf5ff;
        border-bottom: 1px solid #e9d5ff;
      }
      .psc-hero-unknown {
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }

      .psc-hero-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .psc-hero-rule-title {
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
      }
      .psc-hero-rule-sub {
        font-size: 10.5px;
        color: #475569;
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
      .psc-hero-allow .psc-hero-action-badge { background: #166534; color: #ffffff; }
      .psc-hero-block .psc-hero-action-badge { background: #991b1b; color: #ffffff; }
      .psc-hero-isolate .psc-hero-action-badge { background: #6b21a8; color: #ffffff; }

      .psc-hero-body { padding: 12px 14px; }
      .psc-summary-box {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        padding: 8px 12px;
        font-size: 11px;
        color: #0f172a;
        margin-bottom: 10px;
        font-family: var(--hbr-font-mono, monospace);
      }

      .psc-result-details { margin-top: 4px; }
      .psc-result-details summary {
        font-size: 11px;
        font-weight: 700;
        color: #0f172a;
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
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        overflow: hidden;
        background: #ffffff;
      }
      .psc-result-field-row {
        display: grid;
        grid-template-columns: 100px 1fr;
        gap: 8px;
        padding: 6px 10px;
        font-size: 11px;
        border-bottom: 1px solid #f1f5f9;
        font-family: var(--hbr-font-mono, monospace);
      }
      .psc-result-field-row:last-child { border-bottom: none; }
      .psc-result-field-label {
        color: #64748b;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 10px;
      }
      .psc-result-field-value { color: #0f172a; word-break: break-word; }
      .psc-result-field-value.psc-field-any { color: #94a3b8; font-style: italic; }

      .psc-no-match-card {
        border: 1px solid #cbd5e1;
        border-radius: 2px;
        padding: 12px 14px;
        background: #f8fafc;
        font-size: 11px;
        color: #1e293b;
        font-family: var(--hbr-font-mono, monospace);
      }

      /* Rules Filter Bar */
      .psc-rules-filter-bar {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }
      .psc-search-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 2px;
        font-size: 11px;
        font-family: var(--hbr-font-mono, monospace);
        outline: none;
        background: #ffffff;
        color: #0f172a;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }
      .psc-search-input:focus {
        border-color: #0f172a;
        box-shadow: 0 0 0 1px #0f172a;
      }
      .psc-filter-pills {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        max-width: 100%;
      }
      .psc-filter-pill {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 2px;
        padding: 4px 10px;
        font-size: 10.5px;
        font-weight: 700;
        color: #475569;
        cursor: pointer;
        font-family: var(--hbr-font-mono, monospace);
        text-transform: uppercase;
        transition: all 0.15s;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .psc-filter-pill:hover {
        background: #f8fafc;
        color: #0f172a;
      }
      .psc-filter-pill.active {
        background: #0f172a;
        color: #ffffff;
        border-color: #0f172a;
      }

      /* Rule Cards */
      .psc-rule-group {
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        overflow-x: hidden !important;
        margin-bottom: 6px;
        background: #ffffff;
        transition: border-color 0.15s;
        position: relative;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }
      .psc-rule-group:hover {
        border-color: #cbd5e1;
      }
      .psc-rule-group-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px;
        cursor: pointer;
        background: #ffffff;
        list-style: none;
        user-select: none;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        overflow-x: hidden;
      }
      .psc-rule-group-header::-webkit-details-marker { display: none; }

      .psc-rule-top-line {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .psc-rule-prio {
        font-family: var(--hbr-font-mono, monospace);
        font-size: 10px;
        font-weight: 700;
        color: #0f172a;
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        padding: 1px 5px;
        border-radius: 2px;
        flex-shrink: 0;
      }
      .psc-rule-name {
        flex: 1;
        font-weight: 700;
        font-size: 12px;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .psc-rule-action-pill {
        font-family: var(--hbr-font-mono, monospace);
        font-size: 10px;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 2px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        flex-shrink: 0;
      }
      .psc-action-allow { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
      .psc-action-block { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
      .psc-action-isolate { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }

      /* Inline Data Bar on Rules */
      .psc-inline-chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        font-family: var(--hbr-font-mono, monospace);
        font-size: 10px;
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .psc-chip {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        padding: 2px 6px;
        color: #334155;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        max-width: 100%;
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .psc-chip-key { color: #64748b; font-weight: 700; flex-shrink: 0; }
      .psc-chip-val { color: #0f172a; font-weight: 600; overflow-wrap: anywhere; word-break: break-word; }

      .psc-check-list { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: #f8fafc; border-top: 1px solid #e2e8f0; max-width: 100%; box-sizing: border-box; overflow-x: hidden; }
      .psc-check-item {
        border-left: 3px solid;
        padding: 6px 10px;
        border-radius: 2px;
        font-size: 11px;
        line-height: 1.45;
        background: #ffffff;
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
      .psc-check-msg { color: #1e293b; display: block; }
      .psc-check-detail { color: #64748b; font-size: 10px; margin-top: 2px; font-family: var(--hbr-font-mono, monospace); }

      /* Tooltip */
      #psc-tooltip {
        position: fixed;
        display: none;
        background: #0f172a;
        color: #ffffff;
        border: 1px solid #0f172a;
        padding: 8px 12px;
        border-radius: 2px;
        font-size: 11px;
        font-family: var(--hbr-font-mono, monospace);
        line-height: 1.45;
        white-space: pre-wrap;
        z-index: 99999;
        max-width: 350px;
        word-wrap: break-word;
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

  function createSearchableSelect(labelStr, hintStr, inputId, itemsObj) {
    const wrapper = el("div", { class: "psc-dropdown-wrapper" });
    const input = el("input", {
      id: inputId,
      type: "text",
      class: "psc-dropdown-input",
      placeholder: hintStr || "Type to search by name...",
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
        return k.toLowerCase().includes(q) || String(label).toLowerCase().includes(q);
      }).slice(0, 50);

      if (matches.length === 0) {
        list.appendChild(el("li", { style: { color: "#94a3b8", cursor: "default" } }, ["No matching names found"]));
        return;
      }

      matches.forEach(k => {
        const label = itemsObj[k] || k;
        const li = el("li", {}, [
          String(label)
        ]);
        li.addEventListener("click", () => {
          selectedValue = k;
          input.value = String(label);
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

    // --- 1. SOURCE / DESTINATION IP:Port (no enclosing box, space-between) ---
    const ipFieldsRow = el("div", { class: "psc-ip-fields-row" });

    // Source IP:Port Input
    const sourceInput = el("input", {
      id: "psc-src",
      type: "text",
      placeholder: "192.168.1.50:443 or CIDR (e.g. 10.0.0.0/16)",
      autocomplete: "off",
    });
    ipFieldsRow.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-src" }, ["SOURCE"]),
      sourceInput,
    ]));

    // Destination IP:Port Input
    const destInput = el("input", {
      id: "psc-dest",
      type: "text",
      placeholder: "10.0.0.1:80 or Domain (e.g. cisco.com:443)",
      autocomplete: "off",
    });
    ipFieldsRow.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-dest" }, ["DESTINATION"]),
      destInput,
    ]));

    formRow.appendChild(ipFieldsRow);

    // --- 2. TOGGLEABLE ADVANCED SOURCE CRITERIA ---
    const srcAdvToggle = el("button", { type: "button", class: "psc-toggle-btn", id: "psc-toggle-src-adv" }, [
      el("span", {}, ["+ ADVANCED SOURCE CRITERIA"]),
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
    const identitySelect = createSearchableSelect("Identity", "Search AD user, group, or device name...", "psc-identity", identityItems);
    identitySelect.input.disabled = false;
    srcAdvBox.appendChild(identitySelect.element);

    const mergedIdentityTypeMap = Object.assign({}, DEFAULT_IDENTITY_TYPES, identityTypeMap || {});
    const identityTypeSelect = createSearchableSelect("Identity Type", "Search identity type by name...", "psc-identity-type", mergedIdentityTypeMap);
    identityTypeSelect.input.disabled = false;
    srcAdvBox.appendChild(identityTypeSelect.element);

    const sgtInput = el("input", { id: "psc-sgt", type: "text", placeholder: "Search Security Group Tag name...", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-sgt" }, ["Security Group Tag (SGT)"]),
      sgtInput
    ]));

    const locInput = el("input", { id: "psc-location", type: "text", placeholder: "Search Location / Branch name...", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-location" }, ["Location / Branch"]),
      locInput
    ]));

    const intNetInput = el("input", { id: "psc-internal-net", type: "text", placeholder: "Internal Network CIDR or name...", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-internal-net" }, ["Internal Network"]),
      intNetInput
    ]));

    const srcNetObjSelect = createSearchableSelect("Source Network Object", "Search network object by name...", "psc-netobj-src", maps.networkObjects || {});
    srcNetObjSelect.input.disabled = false;
    srcAdvBox.appendChild(srcNetObjSelect.element);

    const tunnelInput = el("input", { id: "psc-tunnel", type: "text", placeholder: "Search Network Tunnel by name...", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-tunnel" }, ["Network Tunnel"]),
      tunnelInput
    ]));

    const postureInput = el("input", { id: "psc-posture", type: "text", placeholder: "Search Device Posture Profile name...", autocomplete: "off" });
    srcAdvBox.appendChild(el("div", { class: "psc-field-group" }, [
      el("label", { class: "psc-field-label", htmlFor: "psc-posture" }, ["Device Posture Profile"]),
      postureInput
    ]));

    const netDevInput = el("input", { id: "psc-network-device", type: "text", placeholder: "Search Network Device hostname or IP...", autocomplete: "off" });
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
      el("span", {}, ["+ ADVANCED DESTINATION CRITERIA"]),
      el("span", { class: "psc-toggle-arrow" }, ["▼"])
    ]);

    const dstAdvBox = el("div", { class: "psc-advanced-box", id: "psc-dst-adv-box" });

    const appSelect = createSearchableSelect("Internet Application", "Search applications by name...", "psc-app", {});
    const protoSelect = createSearchableSelect("Application Protocol", "Search protocols by name...", "psc-proto", {});
    const catSelect = createSearchableSelect("Content Category", "Search categories by name...", "psc-cat", {});
    const privResSelect = createSearchableSelect("Private Resource", "Search private resources by name...", "psc-privres", maps.privateResources || {});
    privResSelect.input.disabled = false;

    const destListSelect = createSearchableSelect("Destination List", "Search destination lists by name...", "psc-destlist", maps.destinationLists || {});
    destListSelect.input.disabled = false;

    const netObjSelect = createSearchableSelect("Network Object", "Search network objects by name...", "psc-netobj", maps.networkObjects || {});
    netObjSelect.input.disabled = false;

    const svcObjSelect = createSearchableSelect("Service Object Group", "Search service groups by name...", "psc-svcobj", maps.serviceObjectGroups || {});
    svcObjSelect.input.disabled = false;

    const appListSelect = createSearchableSelect("Application List", "Search application lists by name...", "psc-applist", maps.applicationLists || {});
    appListSelect.input.disabled = false;

    const catListSelect = createSearchableSelect("Category List", "Search category lists by name...", "psc-catlist", maps.categoryLists || {});
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

    // --- 4. SETTINGS PANEL (right side) — enable additional source/destination fields ---
    const settingsPanel = el("div", { class: "psc-settings-panel" });
    settingsPanel.appendChild(el("div", { class: "psc-settings-title" }, ["FIELD SETTINGS"]));

    // Settings toggles for additional source/destination fields
    const settingsToggles = {
      identity: { label: "Identity", enabled: true },
      identityType: { label: "Identity Type", enabled: true },
      sgt: { label: "Security Group Tag", enabled: true },
      location: { label: "Location / Branch", enabled: false },
      internalNetwork: { label: "Internal Network", enabled: false },
      networkObject: { label: "Network Object", enabled: false },
      tunnel: { label: "Network Tunnel", enabled: false },
      posture: { label: "Device Posture Profile", enabled: false },
      networkDevice: { label: "Network Device", enabled: false },
      app: { label: "Internet Application", enabled: true },
      protocol: { label: "Application Protocol", enabled: true },
      category: { label: "Content Category", enabled: true },
      privateResource: { label: "Private Resource", enabled: false },
      destinationList: { label: "Destination List", enabled: false },
      netObject: { label: "Network Object (Dest)", enabled: false },
      serviceObject: { label: "Service Object Group", enabled: false },
      appList: { label: "Application List", enabled: false },
      catList: { label: "Category List", enabled: false },
    };

    Object.entries(settingsToggles).forEach(([key, cfg]) => {
      const toggle = el("div", {
        class: "psc-setting-toggle" + (cfg.enabled ? " active" : ""),
        "data-setting": key
      });
      toggle.addEventListener("click", () => {
        toggle.classList.toggle("active");
        const isActive = toggle.classList.contains("active");
        // Enable/disable the corresponding input
        const inputMap = {
          identity: identitySelect,
          identityType: identityTypeSelect,
          sgt: sgtInput,
          location: locInput,
          internalNetwork: intNetInput,
          networkObject: srcNetObjSelect,
          tunnel: tunnelInput,
          posture: postureInput,
          networkDevice: netDevInput,
          app: appSelect,
          protocol: protoSelect,
          category: catSelect,
          privateResource: privResSelect,
          destinationList: destListSelect,
          netObject: netObjSelect,
          serviceObject: svcObjSelect,
          appList: appListSelect,
          catList: catListSelect,
        };
        const sel = inputMap[key];
        if (sel && sel.input) {
          sel.input.disabled = !isActive;
        }
      });
      settingsPanel.appendChild(el("div", { class: "psc-setting-row" }, [
        el("label", { class: "psc-setting-label" }, [cfg.label]),
        toggle
      ]));
    });

    formRow.appendChild(settingsPanel);
    body.appendChild(formRow);

    // Asynchronously populate lookups
    loadLookups().then(lookups => {
      const newAppSelect = createSearchableSelect("Internet Application", "Search applications by name...", "psc-app", lookups.apps);
      const newProtoSelect = createSearchableSelect("Application Protocol", "Search protocols by name...", "psc-proto", lookups.protocols);
      const newCatSelect = createSearchableSelect("Content Category", "Search categories by name...", "psc-cat", lookups.categories);
      
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
      "Enter search criteria above and click Run Simulation"
    ]);
    resultCol.appendChild(placeholder);
    body.appendChild(resultCol);

    panel.appendChild(body);
    container.appendChild(panel);

    function updateResult(result) {
      resultCol.innerHTML = "";

      if (!result) {
        resultCol.appendChild(el("div", { id: "psc-result-placeholder" }, [
          "Enter search criteria above and click Run Simulation"
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

    const root = el("div", { id: "psc-rules-list-root", style: { display: "flex", flexDirection: "column", gap: "10px", padding: "12px 14px", width: "100%", maxWidth: "100%", boxSizing: "border-box", overflowX: "hidden" } });
    container.appendChild(root);

    const filterBar = el("div", { class: "psc-rules-filter-bar" });
    const searchInput = el("input", {
      type: "text",
      class: "psc-search-input",
      placeholder: "Search rules by name, identity, destination, or app...",
      autocomplete: "off",
    });

    const pillsContainer = el("div", { class: "psc-filter-pills" });
    const filterOptions = [
      { id: "all", label: "All" },
      { id: "allow", label: "Permit" },
      { id: "block", label: "Deny" },
      { id: "private", label: "Private Access" },
      { id: "internet", label: "Internet Access" },
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

    function lookupItemName(mapObj, key) {
      if (!mapObj || key === undefined || key === null) return null;
      const kStr = String(key);
      const val = mapObj[kStr] !== undefined ? mapObj[kStr] : mapObj[key];
      if (!val) return null;
      if (typeof val === "string") return val;
      if (typeof val === "object" && val.name) return val.name;
      return String(val);
    }

    // resolveCountryCode — turns ISO 3166-1 alpha-2 country codes into
    // full country names for the geolocations/location condition display.
    // Uses Intl.DisplayNames (available in all Chromium-based browsers) so
    // we don't need a bundled country-name lookup table. Falls back to the
    // raw code if resolution fails.
    function resolveCountryCode(code) {
      if (!code || typeof code !== "string") return String(code || "");
      const trimmed = code.trim();
      // Already a full name (more than 2 chars or contains a space) — pass through
      if (trimmed.length !== 2 || !/^[A-Za-z]{2}$/.test(trimmed)) return trimmed;
      try {
        const dn = new Intl.DisplayNames(["en"], { type: "region" });
        return dn.of(trimmed.toUpperCase()) || trimmed;
      } catch {
        return trimmed;
      }
    }

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
            if (values === true) summaryText = `${type.split(".")[1].toUpperCase()}: ANY`;
            break;
          case "umbrella.source.identity_ids":
          case "umbrella.source.identity_ids_shared": {
            const identityNames = (Array.isArray(values) ? values : [values]).map((id) => {
              return lookupItemName(lookups.identities, id) || `Identity #${id}`;
            });
            summaryText = `Identity: ${identityNames.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_ids": {
            const appMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.apps, id) || lookupItemName(lookups.protocols, id);
              appMatches.push(name || `App #${id}`);
            }
            summaryText = `App: ${appMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_category_ids":
          case "umbrella.destination.category_ids": {
            const catMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.categories, id);
              catMatches.push(name || `Category #${id}`);
            }
            summaryText = `Category: ${catMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.private_resource_ids":
          case "umbrella.destination.private_resource_group_ids": {
            const resMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.privateResources, id) || lookupItemName(lookups.objects, id);
              resMatches.push(name || `Private Resource #${id}`);
            }
            summaryText = `Private Resource: ${resMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.destination_list_ids": {
            const listMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.destinationLists, id);
              listMatches.push(name || `Destination List #${id}`);
            }
            summaryText = `Destination List: ${listMatches.join(", ")}`;
            break;
          }
          case "umbrella.source.networkObjectIds":
          case "umbrella.source.networkObjectIds_shared": {
            const objMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.networkObjects, id);
              objMatches.push(name || `Network Object #${id}`);
            }
            summaryText = `Network Object: ${objMatches.join(", ")}`;
            break;
          }
          case "umbrella.source.networkObjectGroupIds":
          case "umbrella.source.networkObjectGroupIds_shared": {
            const grpMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.networkObjects, id);
              grpMatches.push(name || `Network Group #${id}`);
            }
            summaryText = `Network Group: ${grpMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.networkObjectGroupIds": {
            const grpMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.networkObjects, id);
              grpMatches.push(name || `Network Group #${id}`);
            }
            summaryText = `Network Group: ${grpMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.serviceObjectIds": {
            const svcMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.serviceObjectGroups, id);
              svcMatches.push(name || `Service Group #${id}`);
            }
            summaryText = `Service Group: ${svcMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_list_ids": {
            const listMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.applicationLists, id);
              listMatches.push(name || `App List #${id}`);
            }
            summaryText = `App List: ${listMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.composite_inline_ip": {
            const items = Array.isArray(values) ? values : [values];
            const parts = items.map((item) => {
              if (item && typeof item === "object") {
                const ip = Array.isArray(item.ip) ? item.ip.join(",") : (item.ip || "*");
                const port = Array.isArray(item.port) ? item.port.join(",") : (item.port || "*");
                const proto = item.protocol || "ANY";
                return `${ip}:${port}/${proto}`;
              }
              return String(item);
            });
            summaryText = `Dst IP/Port/Proto: ${parts.join(" + ")}`;
            break;
          }
          case "umbrella.source.composite_inline_ip": {
            const items = Array.isArray(values) ? values : [values];
            const parts = items.map((item) => {
              if (item && typeof item === "object") {
                const ip = Array.isArray(item.ip) ? item.ip.join(",") : (item.ip || "*");
                const port = Array.isArray(item.port) ? item.port.join(",") : (item.port || "*");
                const proto = item.protocol || "ANY";
                return `${ip}:${port}/${proto}`;
              }
              return String(item);
            });
            summaryText = `Src IP/Port/Proto: ${parts.join(" + ")}`;
            break;
          }
          case "umbrella.destination.security_group_tag_ids":
          case "umbrella.destination.any_security_group_tag": {
            const ids = Array.isArray(values) ? values : [values];
            summaryText = `SGT: ${ids.join(", ")}`;
            break;
          }
          case "umbrella.source.geolocations": {
            const geos = Array.isArray(values) ? values : [values];
            const names = geos.map((g) => resolveCountryCode(g));
            summaryText = `Source Countries: ${names.join(", ")}`;
            break;
          }
          case "umbrella.destination.geolocations": {
            const geos = Array.isArray(values) ? values : [values];
            const names = geos.map((g) => resolveCountryCode(g));
            summaryText = `Destination Countries: ${names.join(", ")}`;
            break;
          }
          case "umbrella.source.location":
          case "umbrella.destination.location": {
            const locs = Array.isArray(values) ? values : [values];
            summaryText = `Location: ${locs.join(", ")}`;
            break;
          }
          case "umbrella.source.tunnel":
          case "umbrella.destination.tunnel": {
            const tunnels = Array.isArray(values) ? values : [values];
            summaryText = `Tunnel: ${tunnels.join(", ")}`;
            break;
          }
          case "umbrella.source.sgt":
          case "umbrella.destination.sgt": {
            const sgts = Array.isArray(values) ? values : [values];
            summaryText = `SGT: ${sgts.join(", ")}`;
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
            summaryText = `${label}: ${values}`;
            break;
          }
          case "umbrella.destination.saasTenantIds": {
            const ids = Array.isArray(values) ? values : [values];
            summaryText = `SaaS Tenant: ${ids.join(", ")}`;
            break;
          }
          case "umbrella.destination.appRiskProfileId": {
            const ids = Array.isArray(values) ? values : [values];
            const names = ids.map((id) => {
              const name = lookups.appRiskProfiles && lookups.appRiskProfiles[String(id)];
              return name || `App Risk Profile #${String(id).substring(0, 8)}…`;
            });
            summaryText = `App Risk Profile: ${names.join(", ")}`;
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
          default: {
            // Fallback: strip umbrella. prefix and source./destination. prefix,
            // replace underscores with spaces, uppercase the dimension name.
            const simple = type.replace(/^umbrella\./i, "").replace(/^(source|destination)\./i, "").replace(/_/g, " ");
            const valStr = Array.isArray(values) ? values.map(v => typeof v === "object" ? JSON.stringify(v) : v).join(", ") : values;
            summaryText = `${simple.toUpperCase()}: ${valStr}`;
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
      lookups.identityTypes = Object.assign({}, DEFAULT_IDENTITY_TYPES, identityTypeMap || {});
      lookups.objects = objectMap || {};
      lookups.privateResources = (objectMaps && objectMaps.privateResources) || objectMap || {};
      lookups.destinationLists = (objectMaps && objectMaps.destinationLists) || {};
      lookups.networkObjects   = (objectMaps && objectMaps.networkObjects) || {};
      lookups.serviceObjectGroups = (objectMaps && objectMaps.serviceObjectGroups) || {};
      lookups.applicationLists = (objectMaps && objectMaps.applicationLists) || {};
      lookups.categoryLists    = (objectMaps && objectMaps.categoryLists) || {};

      rulesContainer.innerHTML = "";
      if (!rules || rules.length === 0) {
        rulesContainer.appendChild(el("p", { class: "psc-empty", style: { textAlign: "center", color: "#64748b", fontFamily: "var(--hbr-font-mono)" } }, ["No rules loaded"]));
        return;
      }

      const findingsByRule = new Map();
      for (const f of findings || []) {
        if (f.ruleId !== undefined && f.ruleId !== null) {
          const k = String(f.ruleId);
          if (!findingsByRule.has(k)) findingsByRule.set(k, []);
          findingsByRule.get(k).push(f);
        }
        if (f.ruleName) {
          const kName = String(f.ruleName).trim().toLowerCase();
          if (!findingsByRule.has(kName)) findingsByRule.set(kName, []);
          findingsByRule.get(kName).push(f);
        }
      }

      for (const rule of rules) {
        const rName = rule.ruleName || rule.name || "(unnamed)";
        const rAction = (rule.ruleAction || rule.action || "allow").toLowerCase();
        const rPrio = rule.rulePriority !== undefined ? rule.rulePriority : rule.order;
        const rId = rule.ruleId !== undefined ? rule.ruleId : rule.id;

        const idKey = String(rId);
        const nameKey = String(rName).trim().toLowerCase();
        const idFindings = findingsByRule.get(idKey) || [];
        const nameFindings = findingsByRule.get(nameKey) || [];

        // Deduplicate findings for this rule
        const seen = new Set();
        const ruleFindings = [];
        for (const f of [...idFindings, ...nameFindings]) {
          const sig = `${f.checkId}:${f.message}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            ruleFindings.push(f);
          }
        }

        const borderLeftColor = rAction === "allow" ? "#166534" : (rAction === "block" ? "#991b1b" : "#6b21a8");

        const card = el("details", {
          class: "psc-rule-group",
          "data-action": rAction,
          "data-type": (rule.type || "").toLowerCase(),
          style: { borderLeft: `3px solid ${borderLeftColor}` }
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
        condSummaries.slice(0, 4).forEach(cs => {
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
            el("span", { class: "psc-chip", style: { borderColor: sp.ips_enabled ? "#166534" : "#cbd5e1" } }, [`IPS: ${sp.ips_enabled ? "ON" : "OFF"}`]),
            el("span", { class: "psc-chip", style: { borderColor: sp.amp_malware_enabled ? "#166534" : "#cbd5e1" } }, [`AMP: ${sp.amp_malware_enabled ? "ON" : "OFF"}`]),
            el("span", { class: "psc-chip", style: { borderColor: sp.tls_decryption_enabled ? "#166534" : "#cbd5e1" } }, [`TLS: ${sp.tls_decryption_enabled ? "ON" : "OFF"}`]),
            el("span", { class: "psc-chip", style: { borderColor: sp.dlp_enabled ? "#166534" : "#cbd5e1" } }, [`DLP: ${sp.dlp_enabled ? "ON" : "OFF"}`]),
          ]);
          cardBody.appendChild(spRow);
        }

        // Findings / Audit Feedback section
        const findingsBox = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } });
        if (ruleFindings.length > 0) {
          ruleFindings.forEach(f => {
            const fc = COLOR[f.severity] || COLOR.low;
            findingsBox.appendChild(el("div", { class: "psc-check-item", style: { borderLeftColor: fc.text, background: fc.bg } }, [
              el("div", { class: "psc-check-item-head", style: { color: fc.text } }, [`[AUDIT ISSUE: ${f.checkId.toUpperCase()}] — ${f.severity.toUpperCase()}`]),
              el("span", { class: "psc-check-msg" }, [f.message]),
              f.detail ? el("span", { class: "psc-check-detail" }, [f.detail]) : null
            ].filter(Boolean)));
          });
        } else {
          // Pass indicator when zero audit findings are flagged
          findingsBox.appendChild(el("div", { class: "psc-check-item", style: { borderLeftColor: "#166534", background: "#f0fdf4" } }, [
            el("div", { class: "psc-check-item-head", style: { color: "#15803d" } }, ["✓ AUDIT PASS"]),
            el("span", { class: "psc-check-msg", style: { color: "#166534" } }, ["Rule satisfies security posture checks with logging & inspection enabled."])
          ]));
        }
        cardBody.appendChild(findingsBox);

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