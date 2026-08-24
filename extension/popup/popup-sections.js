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
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0.02em;
        font-family: var(--hbr-font-family);
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
        min-width: 0;
        box-sizing: border-box;
      }

      /* 2-Column Grid Layout: SOURCE on Left, DESTINATION on Right */
      .psc-criteria-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 16px;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      @media (max-width: 720px) {
        .psc-criteria-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .psc-section-box {
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        background: #f8fafc;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        position: relative;
      }

      .psc-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #cbd5e1;
        padding-bottom: 6px;
        margin-bottom: 2px;
      }

      .psc-section-title {
        font-size: 11.5px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0.02em;
        font-family: var(--hbr-font-family);
      }

      .psc-section-toggle {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 2px;
        padding: 4px 8px;
        font-size: 10.5px;
        font-weight: 600;
        color: #0f172a;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        font-family: var(--hbr-font-family);
        transition: all 0.15s;
      }
      .psc-section-toggle:hover {
        background: #f1f5f9;
        border-color: #0f172a;
      }

      .psc-section-popover {
        position: absolute;
        top: 38px;
        right: 12px;
        z-index: 100;
        display: none;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        padding: 10px;
        width: min(260px, calc(100vw - 48px));
        min-width: 0;
        max-width: calc(100% - 24px);
        box-sizing: border-box;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.15);
      }
      .psc-section-popover.open {
        display: block;
      }

      .psc-setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 0;
        font-size: 11px;
        color: #1e293b;
        font-family: var(--hbr-font-family);
        border-bottom: 1px solid #f1f5f9;
      }
      .psc-setting-row:last-child {
        border-bottom: none;
      }
      .psc-setting-label {
        color: #475569;
        font-size: 10.5px;
        font-weight: 500;
      }
      .psc-setting-toggle {
        width: 32px;
        height: 16px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        background: #cbd5e1;
        position: relative;
        cursor: pointer;
        transition: all 0.15s;
      }
      .psc-setting-toggle.active {
        background: #0f172a;
        border-color: #0f172a;
      }
      .psc-setting-toggle::after {
        content: "";
        position: absolute;
        top: 1px;
        left: 1px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #ffffff;
        transition: transform 0.15s;
      }
      .psc-setting-toggle.active::after {
        transform: translateX(16px);
      }

      /* Vertical List of Enabled Inputs */
      .psc-section-fields {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
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
        font-weight: 600;
        color: #0f172a;
        letter-spacing: 0.02em;
        font-family: var(--hbr-font-family);
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
        font-weight: 600;
        color: #475569;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.15s;
        width: 100%;
        font-family: var(--hbr-font-family);
        letter-spacing: 0.02em;
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
        font-family: var(--hbr-font-family);
        letter-spacing: 0.01em;
      }

      .psc-field-group input,
      .psc-field-group select,
      .psc-dropdown-input {
        width: 100%;
        padding: 7px 10px;
        border: 1px solid #cbd5e1 !important;
        border-radius: 2px !important;
        font-size: 12px;
        font-family: var(--hbr-font-family) !important;
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
        color: #1e293b; font-family: var(--hbr-font-family);
        transition: background 0.1s;
      }
      .psc-dropdown-list li:hover { background: #f1f5f9; color: #0f172a; }

      .psc-action-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        width: 100%;
      }
      .psc-action-card {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #0f172a;
        padding: 14px 10px;
        font-size: 13px;
        font-weight: 600;
        font-family: var(--hbr-font-family);
        cursor: pointer;
        text-align: center;
      }
      .psc-action-card:hover { background: #f8fafc; }
      .psc-action-card.is-selected {
        border-color: #049fd9;
        box-shadow: inset 0 0 0 1px #049fd9;
        background: #f0f9ff;
      }
      .psc-cb {
        display: flex;
        flex-direction: column;
        gap: 6px;
        position: relative;
        min-width: 0;
      }
      .psc-cb-label {
        font-size: 12px;
        font-weight: 600;
        color: #0f172a;
        font-family: var(--hbr-font-family);
      }
      .psc-cb-trigger {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 36px;
        padding: 5px 8px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        cursor: text;
        width: 100%;
      }
      .psc-cb.is-open .psc-cb-trigger,
      .psc-cb-trigger:focus-within {
        border-color: #049fd9;
        box-shadow: 0 0 0 1px #049fd9;
      }
      .psc-cb-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex: 1;
        min-width: 0;
        align-items: center;
      }
      .psc-cb-placeholder {
        color: #94a3b8;
        font-size: 12px;
      }
      .psc-cb-caret {
        color: #64748b;
        font-size: 10px;
        flex-shrink: 0;
      }
      .psc-cb-flyout {
        display: none;
        position: absolute;
        top: calc(100% + 2px);
        left: 0;
        right: 0;
        z-index: 40;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      }
      .psc-cb.is-open .psc-cb-flyout { display: block; }
      .psc-cb-flyout { pointer-events: auto; }
      /* Cisco-style nested catalog picker */
      .psc-np {
        display: flex;
        flex-direction: column;
        background: #ffffff;
        min-width: 0;
      }
      .psc-np-search {
        padding: 8px;
        border-bottom: 1px solid #e2e8f0;
      }
      .psc-np-search input {
        width: 100%;
        padding: 7px 10px;
        border: 1px solid #cbd5e1 !important;
        border-radius: 2px !important;
        font-size: 12px;
        font-family: var(--hbr-font-family) !important;
        color: #0f172a !important;
        background: #ffffff !important;
        outline: none;
      }
      .psc-np-search input:focus {
        border-color: #049fd9 !important;
        box-shadow: 0 0 0 1px #049fd9 !important;
      }
      .psc-np-crumb {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 11px;
        color: #0f172a;
        font-weight: 600;
        flex-wrap: wrap;
      }
      .psc-np-crumb button {
        background: none;
        border: none;
        padding: 0;
        color: #0f172a;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .psc-np-crumb button:hover { text-decoration: underline; }
      .psc-np-crumb-sep { color: #94a3b8; font-weight: 500; }
      .psc-np-list {
        max-height: 260px;
        overflow-y: auto;
        padding: 4px 0;
      }
      .psc-np-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        font-size: 12px;
        color: #0f172a;
        cursor: pointer;
        font-family: var(--hbr-font-family);
        min-width: 0;
      }
      .psc-np-row:hover { background: #f8fafc; }
      .psc-np-row.is-disabled { color: #94a3b8; cursor: default; }
      .psc-np-row.is-disabled:hover { background: transparent; }
      .psc-np-info {
        flex-shrink: 0;
        width: 14px;
        height: 14px;
        border: 1px solid #94a3b8;
        border-radius: 50%;
        color: #64748b;
        font-size: 10px;
        line-height: 12px;
        text-align: center;
        font-weight: 700;
      }
      .psc-and-slot {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
      .psc-and-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
      }
      .psc-and-wrap[hidden] { display: none !important; }
      .psc-and-toggle {
        align-self: flex-start;
        background: none;
        border: none;
        padding: 0;
        color: #049fd9;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .psc-and-toggle[hidden] { display: none !important; }
      .psc-and-toggle:hover { text-decoration: underline; }
      .psc-and-label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .psc-np-count {
        color: #64748b;
        font-size: 11px;
        flex-shrink: 0;
      }
      .psc-np-chevron {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        color: #94a3b8;
      }
      .psc-np-chevron svg {
        display: block;
        width: 8px;
        height: 12px;
      }
      .psc-np-badge {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 600;
        color: #334155;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        padding: 1px 6px;
        white-space: nowrap;
      }
      .psc-np-row input[type="checkbox"] {
        width: 14px;
        height: 14px;
        margin: 0;
        flex-shrink: 0;
        accent-color: #049fd9;
      }
      .psc-np-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .psc-np-desc {
        font-size: 11px;
        color: #64748b;
        font-weight: 400;
        line-height: 1.35;
        white-space: normal;
      }
      .psc-np-empty {
        padding: 12px 10px;
        color: #94a3b8;
        font-size: 11px;
      }
      .psc-np-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        min-height: 0;
      }
      .psc-np-chips:empty { display: none; }
      .psc-np-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        padding: 3px 6px 3px 8px;
        font-size: 11px;
        color: #0f172a;
        max-width: 100%;
      }
      .psc-np-chip-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .psc-np-chip button {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 12px;
        line-height: 1;
        padding: 0 2px;
      }
      .psc-np-chip button:hover { color: #0f172a; }
      .psc-np-hidden { position: absolute; width: 0; height: 0; overflow: hidden; clip: rect(0, 0, 0, 0); }

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
        font-weight: 600;
        cursor: pointer;
        padding: 7px 14px;
        border-radius: 2px;
        font-family: var(--hbr-font-family);
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
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        font-family: var(--hbr-font-family);
        transition: all 0.15s;
      }
      #psc-run-btn:hover:not(:disabled) {
        background: #1e293b;
        border-color: #1e293b;
      }
      #psc-run-btn:disabled { background: #e2e8f0; border-color: #cbd5e1; color: #94a3b8; cursor: not-allowed; }
      #psc-form-error { font-size: 11px; color: #b91c1c; min-height: 16px; margin-bottom: 6px; font-family: var(--hbr-font-family); }

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
        font-family: var(--hbr-font-family);
      }

      /* Hero Decision Card — matches popup's black/white design language */
      .psc-hero-card {
        border-radius: 0.50rem;
        overflow: hidden;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      .psc-hero-banner {
        padding: 10px 14px;
        background: #ffffff;
        color: #0f172a;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border-bottom: 1px solid #e2e8f0;
      }
      .psc-hero-allow,
      .psc-hero-block,
      .psc-hero-isolate,
      .psc-hero-unknown {
        background: #ffffff;
        border-bottom: 1px solid #e2e8f0;
      }

      .psc-hero-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .psc-hero-rule-title {
        font-size: 12.5px;
        font-weight: 600;
        color: #0f172a;
        word-break: break-word;
      }
      .psc-hero-rule-sub {
        font-size: 10.5px;
        color: #64748b;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .psc-hero-action-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 9999px;
        letter-spacing: 0.05em;
        color: #fff;
        flex-shrink: 0;
      }
      .psc-hero-allow .psc-hero-action-badge { background: #16a34a; }
      .psc-hero-block .psc-hero-action-badge { background: #c0392b; }
      .psc-hero-isolate .psc-hero-action-badge { background: #7c3aed; }
      .psc-hero-unknown .psc-hero-action-badge { background: #6b7280; }

      .psc-hero-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
      .psc-summary-box {
        background: #f1f5f9;
        border-left: 2px solid #0f172a;
        border-radius: 0.25rem;
        padding: 6px 8px;
        font-size: 11px;
        color: #1e293b;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
        font-size: 11px;
        color: #0f172a;
        margin-bottom: 10px;
        font-family: var(--hbr-font-family);
      }

      .psc-result-details { margin-top: 4px; }
      .psc-result-details summary {
        font-size: 11px;
        font-weight: 600;
        color: #0f172a;
        cursor: pointer;
        padding: 4px 0;
        user-select: none;
        list-style: none;
        font-family: var(--hbr-font-family);
        letter-spacing: 0.02em;
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
        font-family: var(--hbr-font-family);
      }
      .psc-result-field-row:last-child { border-bottom: none; }
      .psc-result-field-label {
        color: #64748b;
        font-weight: 600;
        font-size: 10.5px;
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
        font-family: var(--hbr-font-family);
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
        font-family: var(--hbr-font-family);
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
        font-weight: 600;
        color: #475569;
        cursor: pointer;
        font-family: var(--hbr-font-family);
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

      /* Policy Audit Summary Banner */
      #psc-audit-summary-container {
        width: 100%;
        margin-bottom: 8px;
      }
      .psc-audit-summary-card {
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        background: #ffffff;
        padding: 12px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
      }
      .psc-audit-summary-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #f1f5f9;
        padding-bottom: 8px;
        margin-bottom: 8px;
      }
      .psc-audit-summary-title {
        font-size: 11.5px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0.02em;
        font-family: var(--hbr-font-family);
      }
      .psc-audit-badge-warning {
        background: #fff7ed;
        color: #c2410c;
        border: 1px solid #fed7aa;
        font-size: 10.5px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 2px;
        font-family: var(--hbr-font-family);
      }
      .psc-audit-badge-pass {
        background: #f0fdf4;
        color: #166534;
        border: 1px solid #bbf7d0;
        font-size: 10.5px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 2px;
        font-family: var(--hbr-font-family);
      }
      .psc-audit-stats-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 4px;
      }
      .psc-audit-stat-chip {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        padding: 3px 8px;
        font-size: 10.5px;
        font-family: var(--hbr-font-family);
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .psc-audit-stat-label { color: #64748b; font-weight: 500; }
      .psc-audit-stat-val { color: #0f172a; font-weight: 700; }
      .psc-audit-stat-chip.has-issues {
        background: #fff7ed;
        border-color: #fed7aa;
      }
      .psc-audit-stat-chip.has-issues .psc-audit-stat-val {
        color: #c2410c;
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
      .psc-rule-meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
        width: 100%;
        max-width: 100%;
      }
      .psc-rule-meta-chip {
        font-size: 9.5px;
        font-weight: 500;
        color: #64748b;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 2px;
        padding: 2px 6px;
        font-family: var(--hbr-font-family);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      .psc-rule-prio {
        font-family: var(--hbr-font-family);
        font-size: 10.5px;
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
        font-weight: 600;
        font-size: 12px;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .psc-rule-action-pill {
        font-family: var(--hbr-font-family);
        font-size: 10.5px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 2px;
        letter-spacing: 0.02em;
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
        font-family: var(--hbr-font-family);
        font-size: 10.5px;
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
      .psc-chip-key { color: #64748b; font-weight: 600; flex-shrink: 0; }
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
        font-weight: 600;
        font-size: 10.5px;
        font-family: var(--hbr-font-family);
      }
      .psc-check-msg { color: #1e293b; display: block; }
      .psc-check-detail { color: #64748b; font-size: 10.5px; margin-top: 2px; font-family: var(--hbr-font-family); }

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
        font-family: var(--hbr-font-family);
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

  function chevronEl() {
    const wrap = el("span", { class: "psc-np-chevron", "aria-hidden": "true" });
    wrap.innerHTML = '<svg viewBox="0 0 8 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 1.5L6.5 6L2 10.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return wrap;
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

  function catalogItemLabel(item, fallbackKey) {
    if (item === undefined || item === null) return String(fallbackKey || "");
    if (typeof item === "string") return item;
    if (typeof item === "object") {
      return item.name || item.label || item.displayName || String(fallbackKey || "");
    }
    return String(item);
  }

  function catalogMapSize(itemsObj) {
    return itemsObj && typeof itemsObj === "object" ? Object.keys(itemsObj).length : 0;
  }

  function parseSelectedIds(raw) {
    if (raw == null || raw === "") return [];
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    return String(raw).split(",").map(s => s.trim()).filter(Boolean);
  }

  // HAR /containers typeId → tester source field. Used by Any User / Any
  // Group / Any Roaming checkboxes so they stay gated with the catalogs
  // they represent. Do not invent IDs that are not in HOVER_DEFAULT or HAR.
  const TYPE_ID_TO_SOURCE_FIELD = {
    7: "users", 3: "groups", 9: "roaming", 5: "endpointDevices", 1: "networks",
    21: "sites", 54: "sgt", 11: "sgt", 52: "catalystSdwan", 40: "tunnelGroups",
    43: "gsuiteUsers", 45: "gsuiteOus",
    32: "networkDevices", 36: "mobileDevices", 38: "chromebooks", 57: "ztnaClients",
  };

  // Cisco From/To combobox: chips in one field, flyout with search,
  // breadcrumbs, category counts, chevrons, checkbox leaves. Hidden field
  // ids stay the ones the matcher already consumes (psc-src-users, …).
  function createNestedCatalogPicker({
    idPrefix,
    rootLabel,
    tree,
    getFieldState,
    getDisabledReason,
    addressInputId,
    addressPlaceholder,
    allowAddress = true,
  }) {
    const selectedByField = {};
    const hiddenInputs = {};
    const facades = {};
    const fieldNodes = {};

    function walk(nodes, visit) {
      (nodes || []).forEach(node => {
        visit(node);
        if (node.children) walk(node.children, visit);
      });
    }
    walk(tree, node => {
      if (!node.fieldKey) return;
      fieldNodes[node.fieldKey] = node;
      selectedByField[node.fieldKey] = {};
      const input = el("input", {
        id: node.inputId,
        type: "text",
        class: "psc-np-hidden",
        tabindex: "-1",
        "aria-hidden": "true",
        autocomplete: "off",
      });
      hiddenInputs[node.fieldKey] = input;
    });
    let needsTypeInput = false;
    walk(tree, node => { if (node.typeIds && node.typeIds.length) needsTypeInput = true; });
    if (needsTypeInput && !hiddenInputs.identityTypes) {
      fieldNodes.identityTypes = { fieldKey: "identityTypes", inputId: idPrefix + "-identity-types", badge: "Type" };
      selectedByField.identityTypes = {};
      hiddenInputs.identityTypes = el("input", {
        id: idPrefix + "-identity-types",
        type: "text",
        class: "psc-np-hidden",
        tabindex: "-1",
        "aria-hidden": "true",
        autocomplete: "off",
      });
    }

    const wrap = el("div", { class: "psc-cb", id: idPrefix + "-cb" });
    const trigger = el("div", { class: "psc-cb-trigger" });
    const chips = el("div", { class: "psc-cb-chips" });
    const placeholder = el("span", { class: "psc-cb-placeholder" }, [addressPlaceholder || "Select"]);
    const caret = el("span", { class: "psc-cb-caret" }, ["▾"]);
    trigger.appendChild(chips);
    trigger.appendChild(caret);

    const flyout = el("div", { class: "psc-cb-flyout" });
    const panel = el("div", { class: "psc-np" });
    const search = el("input", {
      id: idPrefix + "-search",
      type: "text",
      placeholder: "Search",
      autocomplete: "off",
    });
    const crumb = el("div", { class: "psc-np-crumb" });
    const list = el("div", { class: "psc-np-list" });
    panel.appendChild(el("div", { class: "psc-np-search" }, [search]));
    panel.appendChild(crumb);
    panel.appendChild(list);
    flyout.appendChild(panel);

    const addressInput = el("input", {
      id: addressInputId,
      type: "text",
      class: "psc-np-hidden",
      tabindex: "-1",
      "aria-hidden": "true",
      autocomplete: "off",
    });

    const hiddenBox = el("div", { class: "psc-np-hidden" });
    Object.values(hiddenInputs).forEach(input => hiddenBox.appendChild(input));
    hiddenBox.appendChild(addressInput);
    wrap.appendChild(el("label", { class: "psc-cb-label" }, [rootLabel]));
    wrap.appendChild(trigger);
    wrap.appendChild(flyout);
    wrap.appendChild(hiddenBox);

    let path = [];
    let isOpen = false;
    const sortedCache = new WeakMap();
    const VISIBLE_LEAF_LIMIT = 80;

    function fieldState(fieldKey) {
      return (getFieldState && getFieldState(fieldKey)) || { enabled: true };
    }

    function nodeEnabled(node) {
      if (node.typeIds && node.typeIds.length && (!node.fieldKey || node.typeOnly)) {
        return node.typeIds.some(typeId => {
          const key = TYPE_ID_TO_SOURCE_FIELD[String(typeId)];
          return !key || fieldState(key).enabled !== false;
        });
      }
      if (node.status === "unavailable") return false;
      if (node.fieldKey && node.fieldKey !== "identityTypes") return fieldState(node.fieldKey).enabled !== false;
      return (node.children || []).some(nodeEnabled);
    }

    function nodeCount(node) {
      if (node.typeOnly) return 0;
      if (node.fieldKey && node.fieldKey !== "identityTypes") {
        if (node.status === "unavailable") return 0;
        return catalogMapSize(node.items);
      }
      return (node.children || []).reduce((sum, child) => sum + nodeCount(child), 0);
    }

    function collectLeaves(node, acc) {
      if (node.fieldKey && node.fieldKey !== "identityTypes" && !node.typeOnly) acc.push(node);
      else (node.children || []).forEach(child => collectLeaves(child, acc));
      return acc;
    }

    function collectTypeNodes(node, acc) {
      if (node.typeIds && node.typeIds.length) acc.push(node);
      (node.children || []).forEach(child => collectTypeNodes(child, acc));
      return acc;
    }

    function selectedIds(fieldKey) {
      return Object.keys(selectedByField[fieldKey] || {});
    }

    function syncHidden(fieldKey) {
      const input = hiddenInputs[fieldKey];
      if (!input) return;
      const ids = selectedIds(fieldKey);
      const labels = ids.map(id => selectedByField[fieldKey][id].label);
      if (ids.length) input.dataset.selectedValue = ids.join(",");
      else delete input.dataset.selectedValue;
      input.value = labels.join(", ");
    }

    function dispatchChange() {
      wrap.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const typeChecked = {};

    function typeNodeKey(node) {
      return node.typeKey || node.fieldKey || node.label;
    }

    function collectTypeIds() {
      const ids = [];
      walk(tree, node => {
        if (!node.typeIds || !node.typeIds.length) return;
        if (!typeChecked[typeNodeKey(node)]) return;
        node.typeIds.forEach(id => ids.push(String(id)));
      });
      return Array.from(new Set(ids));
    }

    function syncTypeHidden() {
      const input = hiddenInputs.identityTypes;
      if (!input) return;
      const ids = collectTypeIds();
      const labels = [];
      const keys = [];
      walk(tree, node => {
        if (!node.typeIds || !typeChecked[typeNodeKey(node)]) return;
        labels.push(node.label);
        keys.push(typeNodeKey(node));
      });
      if (ids.length) input.dataset.selectedValue = ids.join(",");
      else delete input.dataset.selectedValue;
      if (keys.length) input.dataset.selectedTypeKeys = keys.join(",");
      else delete input.dataset.selectedTypeKeys;
      input.value = labels.join(", ");
    }

    function setTypeChecked(node, on) {
      typeChecked[typeNodeKey(node)] = Boolean(on);
      syncTypeHidden();
      renderChips();
      renderList();
      dispatchChange();
    }

    function addressList() {
      return String(addressInput.value || "").split("\n").map(part => part.trim()).filter(Boolean);
    }

    function hasAnySelection() {
      if (addressList().length) return true;
      if (collectTypeIds().length) return true;
      return Object.keys(selectedByField).some(key => key !== "identityTypes" && selectedIds(key).length > 0);
    }

    function selectedFieldKeys() {
      return Object.keys(selectedByField).filter(key => key !== "identityTypes" && selectedIds(key).length > 0);
    }

    function nodeDisabledReason(node) {
      if (!getDisabledReason) return "";
      if (node.fieldKey && node.fieldKey !== "identityTypes") {
        return getDisabledReason(node.fieldKey) || "";
      }
      const reasons = (node.children || []).map(nodeDisabledReason).filter(Boolean);
      return reasons[0] || "";
    }

    function renderChips() {
      chips.innerHTML = "";
      walk(tree, node => {
        if (!node.typeIds || !typeChecked[typeNodeKey(node)]) return;
        const chip = el("span", { class: "psc-np-chip" }, [
          el("span", { class: "psc-np-chip-label" }, [node.label]),
        ]);
        const remove = el("button", { type: "button", title: "Remove" }, ["×"]);
        remove.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          setTypeChecked(node, false);
        });
        chip.appendChild(remove);
        chips.appendChild(chip);
      });
      walk(tree, node => {
        if (!node.fieldKey || node.fieldKey === "identityTypes" || node.typeOnly) return;
        selectedIds(node.fieldKey).forEach(id => {
          const rec = selectedByField[node.fieldKey][id];
          const chip = el("span", { class: "psc-np-chip" }, [
            el("span", { class: "psc-np-chip-label" }, [rec.label + (rec.badge ? " (" + rec.badge + ")" : "")]),
          ]);
          const remove = el("button", { type: "button", title: "Remove" }, ["×"]);
          remove.addEventListener("click", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            setSelected(node.fieldKey, id, rec.label, rec.badge, false);
          });
          chip.appendChild(remove);
          chips.appendChild(chip);
        });
      });
      addressList().forEach(address => {
        const chip = el("span", { class: "psc-np-chip" }, [
          el("span", { class: "psc-np-chip-label" }, [address]),
        ]);
        const remove = el("button", { type: "button", title: "Remove" }, ["×"]);
        remove.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          addressInput.value = addressList().filter(item => item !== address).join("\n");
          renderChips();
          dispatchChange();
        });
        chip.appendChild(remove);
        chips.appendChild(chip);
      });
      if (!hasAnySelection()) chips.appendChild(placeholder);
    }

    function looksLikeAddress(q) {
      if (allowAddress === false) return false;
      const value = String(q || "").trim();
      if (!value) return false;
      if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?$/i.test(value)) return true;
      if (/^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?(?::\d+)?$/.test(value)) return true;
      return false;
    }

    function commitAddress(raw) {
      const value = String(raw || "").trim();
      if (!value) return;
      const next = addressList();
      if (!next.includes(value)) next.push(value);
      addressInput.value = next.join("\n");
      renderChips();
      dispatchChange();
      search.value = "";
      renderList();
    }

    function setOpen(on) {
      const next = Boolean(on);
      if (isOpen === next) return;
      isOpen = next;
      wrap.classList.toggle("is-open", isOpen);
      if (isOpen) {
        renderList();
        requestAnimationFrame(() => { if (isOpen) search.focus(); });
      }
    }

    trigger.addEventListener("pointerdown", (evt) => {
      if (evt.button !== 0) return;
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.target.closest("button")) return;
      setOpen(!isOpen);
    });
    trigger.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
    });
    flyout.addEventListener("pointerdown", (evt) => evt.stopPropagation());
    flyout.addEventListener("mousedown", (evt) => evt.stopPropagation());
    flyout.addEventListener("click", (evt) => evt.stopPropagation());
    search.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") {
        evt.preventDefault();
        setOpen(false);
        return;
      }
      if (evt.key !== "Enter") return;
      if (!looksLikeAddress(search.value)) return;
      evt.preventDefault();
      commitAddress(search.value);
    });
    // Capture-phase closer. Bubble mousedown loses the target when a row
    // rebuilds the list, and iframe document clicks can miss a bubble
    // listener on a detached wrap.
    document.addEventListener("pointerdown", (evt) => {
      if (!isOpen) return;
      const eventPath = typeof evt.composedPath === "function" ? evt.composedPath() : [];
      if (eventPath.includes(wrap) || wrap.contains(evt.target)) return;
      setOpen(false);
    }, true);

    function setSelected(fieldKey, id, label, badge, on) {
      const node = fieldNodes[fieldKey];
      selectedByField[fieldKey] = selectedByField[fieldKey] || {};
      if (on) {
        if (node && node.single) selectedByField[fieldKey] = {};
        selectedByField[fieldKey][String(id)] = { label, badge: badge || (node && node.badge) || "" };
      } else {
        delete selectedByField[fieldKey][String(id)];
      }
      syncHidden(fieldKey);
      renderChips();
      if (isOpen) renderList();
      dispatchChange();
    }

    function renderCrumb() {
      crumb.innerHTML = "";
      if (!path.length) {
        crumb.style.display = "none";
        return;
      }
      crumb.style.display = "flex";
      const rootBtn = el("button", { type: "button" }, [rootLabel]);
      rootBtn.addEventListener("click", () => { path = []; renderList(); });
      crumb.appendChild(rootBtn);
      path.forEach((node, idx) => {
        crumb.appendChild(el("span", { class: "psc-np-crumb-sep" }, [">"]));
        const btn = el("button", { type: "button" }, [node.label]);
        btn.addEventListener("click", () => { path = path.slice(0, idx + 1); renderList(); });
        crumb.appendChild(btn);
      });
    }

    function emptyMessage(node) {
      if (node.status === "loading" || node.items === undefined) return "Loading catalog…";
      if (node.status === "unavailable") return node.emptyText || "Catalog unavailable — refresh the dashboard";
      return "No " + String(node.label || "items").toLowerCase() + " configured";
    }

    function matchesQuery(label, id, q) {
      if (!q) return true;
      return String(label).toLowerCase().includes(q) || String(id).toLowerCase().includes(q);
    }

    function sortedItemEntries(items) {
      const map = items || {};
      const cached = sortedCache.get(map);
      if (cached) return cached;
      const entries = Object.keys(map).map(id => ({
        id,
        label: catalogItemLabel(map[id], id),
      })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
      sortedCache.set(map, entries);
      return entries;
    }

    function appendMoreRow(hiddenCount, hint) {
      if (hiddenCount <= 0) return;
      list.appendChild(el("div", { class: "psc-np-empty" }, [
        hiddenCount + " more — type to search" + (hint ? " " + hint : ""),
      ]));
    }

    function appendCategoryRow(node) {
      const enabled = nodeEnabled(node);
      const hasItems = Boolean(node.fieldKey && node.fieldKey !== "identityTypes" && !node.typeOnly);
      const hasKids = Boolean((node.children && node.children.length) || hasItems);
      const row = el("div", { class: "psc-np-row" + (enabled ? "" : " is-disabled") });
      if (node.typeIds && node.typeIds.length) {
        const box = el("input", { type: "checkbox" });
        box.checked = Boolean(typeChecked[typeNodeKey(node)]);
        box.disabled = !enabled;
        row.appendChild(box);
        if (enabled) {
          box.addEventListener("click", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            setTypeChecked(node, !typeChecked[typeNodeKey(node)]);
          });
        }
      }
      const text = el("div", { class: "psc-np-text" });
      text.appendChild(el("span", { class: "psc-np-name" }, [node.label]));
      if (node.description) text.appendChild(el("span", { class: "psc-np-desc" }, [node.description]));
      row.appendChild(text);
      if (hasKids) {
        row.appendChild(el("span", { class: "psc-np-count" }, [String(nodeCount(node))]));
        if (enabled) row.appendChild(chevronEl());
        else {
          const reason = nodeDisabledReason(node);
          if (reason) {
            const info = el("span", { class: "psc-np-info", title: reason }, ["i"]);
            row.appendChild(info);
          }
        }
        if (enabled) {
          row.addEventListener("click", (evt) => {
            if (evt.target.closest("input[type=checkbox]")) return;
            path = path.concat([node]);
            search.value = "";
            renderList();
          });
        }
      } else if (node.typeIds && enabled) {
        row.addEventListener("click", (evt) => {
          if (evt.target.closest("input[type=checkbox]")) return;
          setTypeChecked(node, !typeChecked[typeNodeKey(node)]);
        });
      } else if (!enabled) {
        const reason = nodeDisabledReason(node);
        if (reason) row.appendChild(el("span", { class: "psc-np-info", title: reason }, ["i"]));
      }
      list.appendChild(row);
    }

    function appendLeafRow(node, id, label) {
      const enabled = nodeEnabled(node);
      const checked = Boolean(selectedByField[node.fieldKey] && selectedByField[node.fieldKey][id]);
      const row = el("div", { class: "psc-np-row" + (enabled ? "" : " is-disabled") });
      const box = el("input", { type: "checkbox" });
      box.checked = checked;
      box.disabled = !enabled;
      row.appendChild(box);
      row.appendChild(el("span", { class: "psc-np-name" }, [label]));
      if (node.badge) row.appendChild(el("span", { class: "psc-np-badge" }, [node.badge]));
      if (enabled) {
        const toggle = (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          setSelected(node.fieldKey, id, label, node.badge, !checked);
        };
        row.addEventListener("click", toggle);
        box.addEventListener("click", toggle);
      }
      list.appendChild(row);
    }

    function renderList() {
      if (!isOpen) return;
      list.innerHTML = "";
      renderCrumb();
      const q = (search.value || "").trim().toLowerCase();
      const current = path.length ? path[path.length - 1] : { label: rootLabel, children: tree };

      if (q) {
        const scope = path.length ? current : { children: tree };
        let shown = 0;
        let hidden = 0;
        collectTypeNodes(scope, []).forEach(node => {
          if (!nodeEnabled(node) && !typeChecked[typeNodeKey(node)]) return;
          if (!matchesQuery(node.label, "", q) && !(node.description && matchesQuery(node.description, "", q))) return;
          if (shown >= VISIBLE_LEAF_LIMIT) { hidden += 1; return; }
          appendCategoryRow(node);
          shown += 1;
        });
        collectLeaves(scope, []).forEach(node => {
          if (!nodeEnabled(node) && !selectedIds(node.fieldKey).length) return;
          if (node.status === "unavailable") return;
          sortedItemEntries(node.items).forEach(({ id, label }) => {
            if (!matchesQuery(label, id, q)) return;
            if (shown >= VISIBLE_LEAF_LIMIT) { hidden += 1; return; }
            appendLeafRow(node, id, label);
            shown += 1;
          });
        });
        if (!shown && looksLikeAddress(search.value)) {
          const addRow = el("div", { class: "psc-np-row" });
          addRow.appendChild(el("span", { class: "psc-np-name" }, ["Use “" + search.value.trim() + "”"]));
          addRow.addEventListener("click", () => commitAddress(search.value));
          list.appendChild(addRow);
          return;
        }
        if (!shown) list.appendChild(el("div", { class: "psc-np-empty" }, ["No matching items"]));
        else appendMoreRow(hidden);
        return;
      }

      if (current.children && current.children.length) {
        const children = current.children.filter(child =>
          nodeEnabled(child) || child.status === "unavailable" || Boolean(nodeDisabledReason(child))
        );
        if (!children.length) {
          list.appendChild(el("div", { class: "psc-np-empty" }, ["No categories available"]));
          return;
        }
        children.forEach(appendCategoryRow);
        return;
      }

      if (current.fieldKey && current.fieldKey !== "identityTypes" && !current.typeOnly) {
        if (current.status === "unavailable" || current.items === undefined || !catalogMapSize(current.items)) {
          list.appendChild(el("div", { class: "psc-np-empty" }, [emptyMessage(current)]));
          return;
        }
        const entries = sortedItemEntries(current.items);
        entries.slice(0, VISIBLE_LEAF_LIMIT).forEach(({ id, label }) => {
          appendLeafRow(current, id, label);
        });
        appendMoreRow(entries.length - VISIBLE_LEAF_LIMIT);
        return;
      }

      list.appendChild(el("div", { class: "psc-np-empty" }, ["No categories available"]));
    }

    search.addEventListener("input", renderList);

    function getValue(fieldKey) {
      const ids = selectedIds(fieldKey);
      if (ids.length === 0) return "";
      if (ids.length === 1) return ids[0];
      return ids.slice();
    }

    function restoreTypes(selected, labels, typeKeys) {
      const wantedKeys = new Set(parseSelectedIds(typeKeys || ""));
      const wantedLabels = new Set(parseSelectedIds(labels || "").map(part => part.toLowerCase()));
      const wantedIds = new Set(parseSelectedIds(selected || ""));
      const typeOnlyNodes = [];
      const leafNodes = [];
      walk(tree, node => {
        if (!node.typeIds || !node.typeIds.length) return;
        typeChecked[typeNodeKey(node)] = false;
        if (node.typeOnly) typeOnlyNodes.push(node);
        else leafNodes.push(node);
      });
      const preferKeys = wantedKeys.size > 0;
      const preferLabels = !preferKeys && wantedLabels.size > 0;
      const mark = (nodes) => {
        nodes.forEach(node => {
          const key = typeNodeKey(node);
          if (preferKeys) typeChecked[key] = wantedKeys.has(key);
          else if (preferLabels) typeChecked[key] = wantedLabels.has(String(node.label || "").toLowerCase());
        });
      };
      if (preferKeys || preferLabels) {
        mark(typeOnlyNodes.concat(leafNodes));
      } else {
        // Legacy drafts only stored type IDs. Prefer the Any-* parent so
        // shared IDs do not also light up every sibling catalog.
        typeOnlyNodes.forEach(node => {
          typeChecked[typeNodeKey(node)] = node.typeIds.every(id => wantedIds.has(String(id)));
        });
        const covered = new Set();
        typeOnlyNodes.forEach(node => {
          if (!typeChecked[typeNodeKey(node)]) return;
          node.typeIds.forEach(id => covered.add(String(id)));
        });
        leafNodes.forEach(node => {
          typeChecked[typeNodeKey(node)] = node.typeIds.some(id => wantedIds.has(String(id)) && !covered.has(String(id)));
        });
      }
      syncTypeHidden();
    }

    function restore(fieldKey, value, selected) {
      if (fieldKey === "identityTypes") {
        restoreTypes(selected, value, hiddenInputs.identityTypes && hiddenInputs.identityTypes.dataset.selectedTypeKeys);
        renderChips();
        return;
      }
      const node = fieldNodes[fieldKey];
      selectedByField[fieldKey] = {};
      const ids = parseSelectedIds(selected || "");
      ids.forEach(id => {
        const item = node && node.items ? node.items[id] : null;
        const label = catalogItemLabel(item, value || id);
        selectedByField[fieldKey][id] = { label, badge: (node && node.badge) || "" };
      });
      if (!ids.length && selected) {
        selectedByField[fieldKey][String(selected)] = {
          label: value || String(selected),
          badge: (node && node.badge) || "",
        };
      }
      syncHidden(fieldKey);
      renderChips();
    }

    function resetField(fieldKey) {
      if (fieldKey === "identityTypes") {
        Object.keys(typeChecked).forEach(key => { typeChecked[key] = false; });
        syncTypeHidden();
        renderChips();
        return;
      }
      selectedByField[fieldKey] = {};
      syncHidden(fieldKey);
      renderChips();
    }

    function ingestDraft() {
      Object.keys(hiddenInputs).forEach(fieldKey => {
        const input = hiddenInputs[fieldKey];
        restore(fieldKey, input.value, input.dataset.selectedValue || "");
      });
      renderChips();
      renderList();
    }

    function makeFacade(fieldKey) {
      const input = hiddenInputs[fieldKey];
      return {
        element: wrap,
        input,
        getValue: () => fieldKey === "identityTypes" ? collectTypeIds() : getValue(fieldKey),
        restore: (value, selected) => { restore(fieldKey, value, selected); if (isOpen) renderList(); },
        reset: () => { resetField(fieldKey); if (isOpen) renderList(); },
      };
    }

    walk(tree, node => {
      if (node.fieldKey) facades[node.fieldKey] = makeFacade(node.fieldKey);
    });
    if (hiddenInputs.identityTypes) facades.identityTypes = makeFacade("identityTypes");

    renderChips();

    return {
      element: wrap,
      addressInput,
      facades,
      isOpen: () => isOpen,
      refresh() { if (isOpen) renderList(); },
      selectedFieldKeys,
      hasAnySelection,
      resetAll() {
        Object.keys(typeChecked).forEach(key => { typeChecked[key] = false; });
        syncTypeHidden();
        Object.keys(selectedByField).forEach(resetField);
        addressInput.value = "";
        path = [];
        search.value = "";
        setOpen(false);
        renderList();
        renderChips();
      },
      ingestDraft,
    };
  }

  function clonePickerTree(nodes, idPrefix) {
    return (nodes || []).map(node => {
      const copy = Object.assign({}, node);
      if (copy.inputId) copy.inputId = `${idPrefix}-${copy.inputId}`;
      if (copy.children) copy.children = clonePickerTree(copy.children, idPrefix);
      return copy;
    });
  }

  function mergePickerValues(primary, secondary, key) {
    const toArr = (value) => {
      if (value == null || value === "") return [];
      return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
    };
    const left = primary && primary.facades && primary.facades[key];
    const right = secondary && secondary.facades && secondary.facades[key];
    const merged = Array.from(new Set([
      ...toArr(left && left.getValue()),
      ...toArr(right && right.getValue()),
    ]));
    if (!merged.length) return "";
    if (merged.length === 1) return merged[0];
    return merged;
  }

  function buildTesterPanel(container, rules, identityOptions, objectMaps, identityTypeMap, identityMap, onRun, onReset) {
    injectStyles();

    const maps = objectMaps && typeof objectMaps === "object" ? objectMaps : {
      privateResources: objectMaps || {},
      destinationLists: {},
      networkObjects: {},
      serviceObjectGroups: {},
      applicationLists: {},
      categoryLists: {},
    };

    // ---------------------------------------------------------------------
    // Destination families stay mutually exclusive (Cisco trafficScope).
    // First-field chips stay OR; AND is fail-closed to screenshot-proven
    // families only.
    // ---------------------------------------------------------------------
    const DEST_FAMILY = { privateResource: "private", privateResourceGroup: "private", privateResourceType: "private", destScope: "scope", destinationList: "internet", netObject: "internet", netObjectGroup: "internet", serviceObject: "internet", serviceObjectItem: "internet", application: "internet", protocol: "internet", enterpriseApplication: "internet", appList: "internet", appCategory: "internet", contentCategory: "internet", catList: "internet", geolocation: "internet", appRiskProfile: "internet" };
    // Screenshot/HAR fail-closed AND matrix. Same-field chips stay OR.
    // Unproven first-pick families do not get a second picker.
    const SOURCE_IDENTITY_FIELDS = new Set([
      "users", "gsuiteUsers", "groups", "gsuiteOus", "roaming",
      "mobileDevices", "chromebooks", "endpointDevices",
    ]);
    const SOURCE_AND_LIVE = new Set(["networks", "tunnelGroups"]);
    const DEST_AND_LIVE = new Set(["application", "protocol", "serviceObjectItem", "serviceObject"]);
    const AND_UNSUPPORTED = "This category cannot be combined with the current selection.";

    const panel = el("div", { id: "psc-panel" });

    // Keep a small draft in session storage so a necessary catalog/rule
    // re-render never destroys work in progress. Values are cleared only by
    // the explicit Reset button.
    const draftStorageKey = "psc-tester-draft";
    let draft = {};
    try {
      const parsedDraft = JSON.parse(sessionStorage.getItem(draftStorageKey) || "{}");
      draft = parsedDraft && typeof parsedDraft === "object" && !Array.isArray(parsedDraft) ? parsedDraft : {};
    } catch (_) {}
    let persistDraftTimer = 0;
    const persistDraftNow = () => {
      const fields = Array.from(panel.querySelectorAll("input, textarea, select"));
      const next = {};
      for (const field of fields) {
        if (!field.id) continue;
        next[field.id] = {
          value: field.value || "",
          selected: field.dataset && field.dataset.selectedValue || "",
          typeKeys: field.dataset && field.dataset.selectedTypeKeys || "",
        };
      }
      try { sessionStorage.setItem(draftStorageKey, JSON.stringify(next)); } catch (_) {}
    };
    const persistDraft = () => {
      clearTimeout(persistDraftTimer);
      persistDraftTimer = setTimeout(persistDraftNow, 180);
    };
    const restoreDraft = () => {
      for (const [id, saved] of Object.entries(draft)) {
        const field = panel.querySelector(`#${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id}`);
        if (!field) continue;
        field.value = saved && saved.value || "";
        if (saved && saved.selected) field.dataset.selectedValue = saved.selected;
        else delete field.dataset.selectedValue;
        if (saved && saved.typeKeys) field.dataset.selectedTypeKeys = saved.typeKeys;
        else delete field.dataset.selectedTypeKeys;
      }
    };
    panel.addEventListener("input", persistDraft);
    panel.addEventListener("change", persistDraft);

    const body = el("div", { id: "psc-panel-body" });
    const formRow = el("div", { id: "psc-form-row" });

    // =========================================================================
    // 1. SOURCE / DESTINATION COMBOBOXES
    // =========================================================================
    const sourceEnabled = {};
    const sourceAndEnabled = {};
    const destAndEnabled = {};
    const sourceTree = [
        {
          label: "Users",
          children: [
            {
              label: "Any User",
              typeKey: "anyUser",
              typeOnly: true,
              typeIds: [7, 43],
              description: "Applies this rule to all users, regardless of type or origin.",
            },
            { label: "AD Users", fieldKey: "users", inputId: "psc-src-users", items: maps.sourceUsers, badge: "AD User", typeIds: [7] },
            { label: "Google Workspace Users", fieldKey: "gsuiteUsers", inputId: "psc-src-gsuite-users", items: maps.sourceGsuiteUsers, badge: "Google Workspace User", typeIds: [43] },
          ],
        },
        {
          label: "Groups and Organizational Units",
          children: [
            {
              label: "Any Group or Organizational Unit",
              typeKey: "anyGroup",
              typeOnly: true,
              typeIds: [3, 45],
              description: "Applies this rule to all groups and organizational units, regardless of type or origin.",
            },
            { label: "AD Groups", fieldKey: "groups", inputId: "psc-src-groups", items: maps.sourceGroups, badge: "AD Group", typeIds: [3] },
            { label: "Google Workspace Organizational Units", fieldKey: "gsuiteOus", inputId: "psc-src-gsuite-ous", items: maps.sourceGsuiteOus, badge: "Google Workspace OU", typeIds: [45] },
          ],
        },
        {
          label: "Roaming Devices",
          children: [
            {
              label: "Any Roaming Device",
              typeKey: "anyRoaming",
              typeOnly: true,
              typeIds: [9, 36, 38],
              description: "Applies this rule to all roaming devices, regardless of type or origin.",
            },
            { label: "macOS and Windows Devices", fieldKey: "roaming", inputId: "psc-src-roaming", items: maps.sourceRoaming, badge: "Roaming Computer", typeIds: [9] },
            { label: "iOS and Android Devices", fieldKey: "mobileDevices", inputId: "psc-src-mobile-devices", items: maps.sourceMobileDevices || {}, badge: "Mobile Device", typeIds: [36] },
            { label: "ChromeOS Devices", fieldKey: "chromebooks", inputId: "psc-src-chromebooks", items: maps.sourceChromebooks || {}, badge: "Chromebook", typeIds: [38] },
          ],
        },
        { label: "Endpoint Devices", fieldKey: "endpointDevices", inputId: "psc-src-endpoints", items: maps.sourceEndpointDevices, badge: "AD Computer" },
        { label: "Networks", fieldKey: "networks", inputId: "psc-src-networks", items: maps.sourceNetworks, badge: "Network" },
        { label: "Sites", fieldKey: "sites", inputId: "psc-src-sites", items: maps.sourceSites, badge: "Site" },
        { label: "Network Devices", fieldKey: "networkDevices", inputId: "psc-src-network-devices", items: maps.sourceNetworkDevices || {}, badge: "Network Device" },
        { label: "Security Group Tags", fieldKey: "sgt", inputId: "psc-src-sgt", items: maps.sourceSecurityGroupTags, badge: "SGT" },
        { label: "Catalyst SD-WAN Service VPN IDs", fieldKey: "catalystSdwan", inputId: "psc-src-catalyst-sdwan", items: maps.sourceCatalystSdwan, badge: "SD-WAN VPN" },
        { label: "Network Tunnel Groups", fieldKey: "tunnelGroups", inputId: "psc-src-tunnel-groups", items: maps.sourceTunnelGroups, badge: "Network Tunnel" },
        {
          label: "Network Objects and Network Object Groups",
          children: [
            { label: "Network Objects", fieldKey: "networkObjects", inputId: "psc-src-network-objects", items: maps.networkObjects || {}, badge: "Network Object" },
            { label: "Network Object Groups", fieldKey: "networkObjectGroups", inputId: "psc-src-network-object-groups", items: maps.networkObjectGroups || {}, badge: "Network Object Group" },
          ],
        },
      ];
    const sourcePicker = createNestedCatalogPicker({
      idPrefix: "psc-src-np",
      rootLabel: "From",
      addressInputId: "psc-src",
      addressPlaceholder: "Select sources",
      getFieldState: (fieldKey) => ({ enabled: sourceEnabled[fieldKey] !== false }),
      tree: sourceTree,
    });
    const sourceInputMap = sourcePicker.facades;
    const sourceInput = sourcePicker.addressInput;

    const destEnabled = {};
    const destTree = [
        { label: "Destination Lists", fieldKey: "destinationList", inputId: "psc-destlist", items: maps.destinationLists || {}, badge: "Destination List" },
        { label: "Internet Applications", fieldKey: "application", inputId: "psc-app", items: maps.internetApplications || maps.applications || {}, badge: "Application" },
        { label: "Application Protocols", fieldKey: "protocol", inputId: "psc-protocol", items: maps.applicationProtocols || {}, badge: "Protocol" },
        { label: "Content Categories", fieldKey: "contentCategory", inputId: "psc-content-cat", items: maps.contentCategories || {}, badge: "Content Category" },
        { label: "Geolocations", fieldKey: "geolocation", inputId: "psc-geolocation", items: maps.geolocations || {}, badge: "Geolocation", status: "unavailable", emptyText: "Geolocations are not selectable in this tester" },
        {
          label: "Network Objects and Network Object Groups",
          children: [
            { label: "Network Objects", fieldKey: "netObject", inputId: "psc-netobj", items: maps.networkObjects || {}, badge: "Network Object" },
            { label: "Network Object Groups", fieldKey: "netObjectGroup", inputId: "psc-netobj-group", items: maps.networkObjectGroups || {}, badge: "Network Object Group" },
          ],
        },
        {
          label: "Service Objects and Service Object Groups",
          children: [
            { label: "Service Objects", fieldKey: "serviceObjectItem", inputId: "psc-svcobj-item", items: maps.serviceObjects || {}, badge: "Service Object" },
            { label: "Service Object Groups", fieldKey: "serviceObject", inputId: "psc-svcobj", items: maps.serviceObjectGroups || {}, badge: "Service Object Group" },
          ],
        },
        { label: "Application Lists", fieldKey: "appList", inputId: "psc-applist", items: maps.applicationLists || {}, badge: "Application List" },
        { label: "Application Categories", fieldKey: "appCategory", inputId: "psc-appcat", items: maps.applicationCategories || {}, badge: "App Category" },
        { label: "Category Lists", fieldKey: "catList", inputId: "psc-catlist", items: maps.categoryLists || {}, badge: "Category List" },
        { label: "Enterprise Applications", fieldKey: "enterpriseApplication", inputId: "psc-enterprise-app", items: maps.enterpriseApplications || {}, badge: "Enterprise App" },
        { label: "Private Resources", fieldKey: "privateResource", inputId: "psc-privres", items: maps.privateResources || {}, badge: "Private Resource" },
        { label: "Private Resource Groups", fieldKey: "privateResourceGroup", inputId: "psc-privresgrp", items: maps.privateResourceGroups || {}, badge: "Private Resource Group" },
        { label: "Private Resource Kind", fieldKey: "privateResourceType", inputId: "psc-privres-type", items: { apps: "Applications", networks: "Networks" }, badge: "Resource Kind", single: true },
        { label: "App Risk Profile", fieldKey: "appRiskProfile", inputId: "psc-app-risk", items: maps.appRiskProfiles || {}, badge: "App Risk" },
        { label: "Destination Scope", fieldKey: "destScope", inputId: "psc-dst-scope", items: maps.destinationScopes || { public_internet: "Internet", private_network: "Private Access" }, badge: "Scope", single: true },
      ];
    const destPicker = createNestedCatalogPicker({
      idPrefix: "psc-dst-np",
      rootLabel: "To",
      addressInputId: "psc-dest",
      addressPlaceholder: "Select destinations",
      getFieldState: (fieldKey) => ({ enabled: destEnabled[fieldKey] !== false }),
      tree: destTree,
    });
    const destScopeSelect = destPicker.facades.destScope || { getValue: () => "", restore() {}, reset() {} };
    const destInputMap = destPicker.facades;
    const destInput = destPicker.addressInput;

    const sourceAndPicker = createNestedCatalogPicker({
      idPrefix: "psc-src-and-np",
      rootLabel: "AND",
      addressInputId: "psc-src-and",
      addressPlaceholder: "Select additional sources",
      allowAddress: false,
      getFieldState: (fieldKey) => ({ enabled: sourceAndEnabled[fieldKey] !== false }),
      getDisabledReason: (fieldKey) => sourceAndEnabled[fieldKey] === false ? AND_UNSUPPORTED : "",
      tree: clonePickerTree(sourceTree, "and"),
    });
    const destAndPicker = createNestedCatalogPicker({
      idPrefix: "psc-dst-and-np",
      rootLabel: "AND",
      addressInputId: "psc-dest-and",
      addressPlaceholder: "Select additional destinations",
      allowAddress: false,
      getFieldState: (fieldKey) => ({ enabled: destAndEnabled[fieldKey] !== false }),
      getDisabledReason: (fieldKey) => destAndEnabled[fieldKey] === false ? AND_UNSUPPORTED : "",
      tree: clonePickerTree(destTree, "and"),
    });
    let sourceAndWanted = false;
    let destAndWanted = false;
    const sourceAndWrap = el("div", { class: "psc-and-wrap" }, [sourceAndPicker.element]);
    const destAndWrap = el("div", { class: "psc-and-wrap" }, [destAndPicker.element]);
    const sourceAndToggle = el("button", { type: "button", class: "psc-and-toggle" }, ["+ AND"]);
    const destAndToggle = el("button", { type: "button", class: "psc-and-toggle" }, ["+ AND"]);
    sourceAndWrap.hidden = true;
    destAndWrap.hidden = true;
    sourceAndToggle.hidden = true;
    destAndToggle.hidden = true;
    sourceAndToggle.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      sourceAndWanted = true;
      recomputeEnabledFields();
    });
    destAndToggle.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      destAndWanted = true;
      recomputeEnabledFields();
    });

    const actionInput = el("input", {
      id: "psc-preferred-action",
      type: "text",
      class: "psc-np-hidden",
      tabindex: "-1",
      "aria-hidden": "true",
      autocomplete: "off",
    });
    const actionCards = [
      { value: "allow", label: "Allow" },
      { value: "isolate", label: "Warn Isolate" },
      { value: "block", label: "Block" },
    ].map(opt => {
      const btn = el("button", { type: "button", class: "psc-action-card", "data-action": opt.value }, [opt.label]);
      btn.addEventListener("click", () => {
        const next = actionInput.value === opt.value ? "" : opt.value;
        actionInput.value = next;
        if (next) actionInput.dataset.selectedValue = next;
        else delete actionInput.dataset.selectedValue;
        actionCards.forEach(card => card.classList.toggle("is-selected", card.dataset.action === next));
        recomputeEnabledFields();
        persistDraft();
      });
      return btn;
    });
    const actionRow = el("div", { class: "psc-action-row" }, actionCards);

    formRow.appendChild(actionRow);
    formRow.appendChild(actionInput);
    formRow.appendChild(el("div", { class: "psc-criteria-grid" }, [
      el("div", { class: "psc-and-slot" }, [sourcePicker.element, sourceAndToggle, sourceAndWrap]),
      el("div", { class: "psc-and-slot" }, [destPicker.element, destAndToggle, destAndWrap]),
    ]));
    body.appendChild(formRow);

    // ---------------------------------------------------------------------
    // First-field chips stay OR. Internet vs Private Access destinations
    // remain mutually exclusive. The AND picker is fail-closed: only the
    // screenshot-proven families stay live after a first pick.
    // ---------------------------------------------------------------------
    function firstSourceFamily(keys) {
      if (keys.some(key => SOURCE_IDENTITY_FIELDS.has(key))) return "identity";
      const typeIds = sourcePicker.facades.identityTypes && sourcePicker.facades.identityTypes.getValue();
      if (Array.isArray(typeIds) ? typeIds.length : typeIds) return "identity";
      return "";
    }
    function firstDestFamily(keys) {
      if (keys.includes("destinationList")) return "destList";
      return "";
    }
    function recomputeEnabledFields() {
      let fam = null;
      const dstVals = Object.entries(destInputMap).map(([key, sel]) => ({ key, v: sel.getValue(), f: DEST_FAMILY[key] }));
      const andDestVals = Object.entries(destAndPicker.facades).map(([key, sel]) => ({ key, v: sel.getValue(), f: DEST_FAMILY[key] }));
      if (dstVals.some(d => d.v && d.f === "private") || andDestVals.some(d => d.v && d.f === "private")) fam = "private";
      else if (dstVals.some(d => d.v && d.f === "internet") || andDestVals.some(d => d.v && d.f === "internet")) fam = "internet";
      else if (destInput.value.trim() && /[a-z]/i.test(destInput.value.trim().split("/")[0])) fam = "internet";

      for (const d of dstVals) {
        if (d.f !== "scope" && fam && d.f !== fam && d.v) destInputMap[d.key].reset();
      }
      for (const d of andDestVals) {
        if (d.f !== "scope" && fam && d.f !== fam && d.v) destAndPicker.facades[d.key].reset();
      }

      if (fam === "private" && !destScopeSelect.getValue()) {
        destScopeSelect.restore("Private Access", "private_network");
      } else if (fam === "internet" && !destScopeSelect.getValue()) {
        destScopeSelect.restore("Internet", "public_internet");
      }

      for (const key of Object.keys(sourceInputMap)) sourceEnabled[key] = true;
      for (const [key, sel] of Object.entries(destInputMap)) {
        const f = DEST_FAMILY[key];
        if (f === "scope") {
          destEnabled[key] = true;
          continue;
        }
        destEnabled[key] = !fam || f === fam;
        if (key === "destinationList" && actionInput.value !== "block") destEnabled[key] = false;
        if (!destEnabled[key] && sel.getValue()) sel.reset();
      }

      const sourceKeys = sourcePicker.selectedFieldKeys();
      const destKeys = destPicker.selectedFieldKeys();
      const sourceAndAllowed = firstSourceFamily(sourceKeys) === "identity";
      const destAndAllowed = firstDestFamily(destKeys) === "destList";
      if (!sourceAndAllowed) sourceAndWanted = false;
      if (!destAndAllowed) destAndWanted = false;
      const sourceAndOn = sourceAndAllowed && sourceAndWanted;
      const destAndOn = destAndAllowed && destAndWanted;
      sourceAndToggle.hidden = !sourceAndAllowed || sourceAndWanted;
      destAndToggle.hidden = !destAndAllowed || destAndWanted;
      sourceAndWrap.hidden = !sourceAndOn;
      destAndWrap.hidden = !destAndOn;
      if (!sourceAndOn) sourceAndPicker.resetAll();
      if (!destAndOn) destAndPicker.resetAll();

      for (const key of Object.keys(sourceAndPicker.facades)) {
        const live = sourceAndOn && SOURCE_AND_LIVE.has(key);
        sourceAndEnabled[key] = live;
        if (!live && sourceAndPicker.facades[key].getValue()) sourceAndPicker.facades[key].reset();
      }
      for (const key of Object.keys(destAndPicker.facades)) {
        const f = DEST_FAMILY[key];
        const live = destAndOn && DEST_AND_LIVE.has(key) && (!fam || f === fam || f === "scope");
        destAndEnabled[key] = live;
        if (key === "destinationList") destAndEnabled[key] = false;
        if (!destAndEnabled[key] && destAndPicker.facades[key].getValue()) destAndPicker.facades[key].reset();
      }

      if (sourcePicker.isOpen()) sourcePicker.refresh();
      if (destPicker.isOpen()) destPicker.refresh();
      if (sourceAndOn && sourceAndPicker.isOpen()) sourceAndPicker.refresh();
      if (destAndOn && destAndPicker.isOpen()) destAndPicker.refresh();
    }

    panel.addEventListener("change", recomputeEnabledFields);
    destInput.addEventListener("input", recomputeEnabledFields);
    recomputeEnabledFields();


    // Footer actions
    const formFooter = el("div", { id: "psc-form-footer" });
    const errorLine = el("p", { id: "psc-form-error" });
    formFooter.appendChild(errorLine);

    const runBtn   = el("button", { id: "psc-run-btn",   type: "button" }, ["Run Simulation"]);
    const resetBtn = el("button", { id: "psc-reset-btn", type: "button" }, ["Reset"]);
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
    restoreDraft();
    sourcePicker.ingestDraft();
    destPicker.ingestDraft();
    sourceAndPicker.ingestDraft();
    destAndPicker.ingestDraft();
    const savedAction = (actionInput.dataset.selectedValue || actionInput.value || "").toLowerCase();
    if (savedAction === "allow" || savedAction === "block" || savedAction === "isolate") {
      actionInput.value = savedAction;
      actionInput.dataset.selectedValue = savedAction;
      actionCards.forEach(card => card.classList.toggle("is-selected", card.dataset.action === savedAction));
    }
    // Draft restore can pre-fill a destination that implies a scope family,
    // so re-run gating now that values are present.
    recomputeEnabledFields();

    function updateResult(result) {
      resultCol.innerHTML = "";

      if (!result) {
        resultCol.appendChild(el("div", { id: "psc-result-placeholder" }, [
          "Enter search criteria above and click Run Simulation"
        ]));
        return;
      }

      if (result && result.noMatch) {
        const diagnostic = result.diagnostic || {};
        const defaults = diagnostic.defaults || [];
        const defaultSummary = defaults.length
          ? defaults.map(rule => `${rule.name || "Unnamed"} [${rule.scope || "no scope"}]`).join("; ")
          : "No default rules are loaded.";
        const rejected = Array.isArray(result.rejected) ? result.rejected : [];
        const rejectionSummary = rejected.length
          ? rejected.slice(0, 8).map(rule => `${rule.ruleName}: ${rule.reason}`).join("\n")
          : "No candidate-rule trace was recorded.";
        resultCol.appendChild(el("div", { class: "psc-no-match-card" }, [
          el("span", {}, ["⚠️ No rule matched the current runtime data." ]),
          el("div", { style: { marginTop: "6px", fontSize: "11px", color: "#cbd5e1", lineHeight: "1.45" } }, [
            `Debug: destination=${diagnostic.destination || "(blank)"}; selected scope=${diagnostic.scope || "(blank)"}; normalized=${diagnostic.normalizedScope || "(none)"}.`
          ]),
          el("div", { style: { marginTop: "4px", fontSize: "11px", color: "#94a3b8", lineHeight: "1.45" } }, [
            `Loaded defaults: ${defaultSummary}`
          ]),
          el("div", { style: { marginTop: "6px", fontSize: "11px", color: "#cbd5e1", lineHeight: "1.45", whiteSpace: "pre-wrap" } }, [
            `Rejected-rule trace (first ${Math.min(rejected.length, 8)}):\n${rejectionSummary}`
          ]),
          diagnostic.defaultRuleFetch && diagnostic.defaultRuleFetch.error
            ? el("div", { style: { marginTop: "4px", fontSize: "11px", color: "#fca5a5", lineHeight: "1.45" } }, [
                `Default-rule fetch error: ${diagnostic.defaultRuleFetch.error}`
              ])
            : null,
        ].filter(Boolean)));
        return;
      }

      if (result === "NO_MATCH") {
        resultCol.appendChild(el("div", { class: "psc-no-match-card" }, [
          el("span", {}, ["⚠️ No rule matched the current runtime data."]),
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
            el("span", {}, [`Priority #${displayPrio}`]),
            rule.logging_enabled ? el("span", {}, ["• Logs: Enabled"]) : null,
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
        ? `${matchFields.identity.constrained ? matchFields.identity.display : 'Any Identity'} ➔ ${matchFields.destination.constrained ? matchFields.destination.display : (matchFields.app.constrained ? matchFields.app.display : 'Any Traffic')}`
        : "Matched rule conditions";

      const summaryBox = el("div", { class: "psc-summary-box" }, [
        el("strong", {}, ["Match Reason: "]),
        summaryText
      ]);

      const detailsElem = el("details", { class: "psc-result-details" }, [
        el("summary", {}, ["▶ View full match matrix & attributes"]),
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

    function parseIpInput(val) {
      if (!val) return { ipCidr: "" };
      const tokens = String(val).split(/[\n,]+/).map(part => part.trim()).filter(Boolean);
      if (!tokens.length) return { ipCidr: "" };
      if (tokens.length === 1) {
        const portMatch = tokens[0].match(/:(\d+)$/);
        if (!portMatch) return { ipCidr: tokens[0] };
        return {
          ipCidr: tokens[0].substring(0, tokens[0].length - portMatch[0].length),
          port: portMatch[1],
        };
      }
      return { ipCidr: tokens.join("\n") };
    }

    runBtn.addEventListener("click", () => {
      const srcVal = sourceInput.value.trim();
      const destVal = destInput.value.trim();
      const usersId = mergePickerValues(sourcePicker, sourceAndPicker, "users");
      const identityTypeIds = mergePickerValues(sourcePicker, sourceAndPicker, "identityTypes");
      const gsuiteUsersId = mergePickerValues(sourcePicker, sourceAndPicker, "gsuiteUsers");
      const gsuiteOusId = mergePickerValues(sourcePicker, sourceAndPicker, "gsuiteOus");
      const roamingId = mergePickerValues(sourcePicker, sourceAndPicker, "roaming");
      const groupsId = mergePickerValues(sourcePicker, sourceAndPicker, "groups");
      const endpointDevicesId = mergePickerValues(sourcePicker, sourceAndPicker, "endpointDevices");
      const networksId = mergePickerValues(sourcePicker, sourceAndPicker, "networks");
      const sitesId = mergePickerValues(sourcePicker, sourceAndPicker, "sites");
      const sgtId = mergePickerValues(sourcePicker, sourceAndPicker, "sgt");
      const catalystSdwanId = mergePickerValues(sourcePicker, sourceAndPicker, "catalystSdwan");
      const tunnelGroupId = mergePickerValues(sourcePicker, sourceAndPicker, "tunnelGroups");
      const sourceNetworkObjectId = mergePickerValues(sourcePicker, sourceAndPicker, "networkObjects");
      const sourceNetworkObjectGroupId = mergePickerValues(sourcePicker, sourceAndPicker, "networkObjectGroups");
      const mobileDeviceId = mergePickerValues(sourcePicker, sourceAndPicker, "mobileDevices");
      const chromebookId = mergePickerValues(sourcePicker, sourceAndPicker, "chromebooks");
      const ztnaClientId = mergePickerValues(sourcePicker, sourceAndPicker, "ztnaClients");
      const networkDeviceId = mergePickerValues(sourcePicker, sourceAndPicker, "networkDevices");
      const destScopeVal = destScopeSelect.getValue();
      const privResId = mergePickerValues(destPicker, destAndPicker, "privateResource");
      const privResGroupId = mergePickerValues(destPicker, destAndPicker, "privateResourceGroup");
      const destListId = mergePickerValues(destPicker, destAndPicker, "destinationList");
      const netObjId = mergePickerValues(destPicker, destAndPicker, "netObject");
      const netObjGroupId = mergePickerValues(destPicker, destAndPicker, "netObjectGroup");
      const svcObjItemId = mergePickerValues(destPicker, destAndPicker, "serviceObjectItem");
      const svcObjId = mergePickerValues(destPicker, destAndPicker, "serviceObject");
      const appId = mergePickerValues(destPicker, destAndPicker, "application");
      const protocolId = mergePickerValues(destPicker, destAndPicker, "protocol");
      const enterpriseAppId = mergePickerValues(destPicker, destAndPicker, "enterpriseApplication");
      const appListId = mergePickerValues(destPicker, destAndPicker, "appList");
      const appCatId = mergePickerValues(destPicker, destAndPicker, "appCategory");
      const contentCatId = mergePickerValues(destPicker, destAndPicker, "contentCategory");
      const catListId = mergePickerValues(destPicker, destAndPicker, "catList");
      const geoVal = mergePickerValues(destPicker, destAndPicker, "geolocation");
      const privateResourceTypeVal = destPicker.facades.privateResourceType
        ? destPicker.facades.privateResourceType.getValue()
        : "";
      const appRiskProfileId = mergePickerValues(destPicker, destAndPicker, "appRiskProfile");

      const hasVal = (value) => Array.isArray(value) ? value.length > 0 : Boolean(value);
      if (![srcVal, destVal, usersId, identityTypeIds, gsuiteUsersId, gsuiteOusId, roamingId, groupsId, endpointDevicesId, networksId, sitesId, sgtId, catalystSdwanId, tunnelGroupId, sourceNetworkObjectId, sourceNetworkObjectGroupId, networkDeviceId, mobileDeviceId, chromebookId, ztnaClientId, destScopeVal, privResId, privResGroupId, destListId, netObjId, netObjGroupId, svcObjItemId, svcObjId, appId, protocolId, enterpriseAppId, appListId, appCatId, contentCatId, catListId, geoVal, privateResourceTypeVal, appRiskProfileId].some(hasVal)) {
        errorLine.textContent = "SELECT AT LEAST ONE CRITERION.";
        return;
      }

      const srcParsed = parseIpInput(srcVal, "Source");
      const destParsed = parseIpInput(destVal, "Destination");

      errorLine.textContent = "";
      runBtn.disabled = true;
      runBtn.textContent = "SIMULATING…";
      
      const testInput = {
        source:                    srcParsed.ipCidr,
        sourcePort:                srcParsed.port,
        sourceUserId:              usersId,
        identityTypeIds,
        sourceGsuiteUserId:        gsuiteUsersId,
        sourceGsuiteOuId:          gsuiteOusId,
        sourceRoamingId:           roamingId,
        sourceGroupId:             groupsId,
        sourceEndpointDeviceId:    endpointDevicesId,
        sourceNetworkId:           networksId,
        sourceSiteId:              sitesId,
        sourceSecurityGroupTagId:  sgtId,
        sourceCatalystSdwanId:    catalystSdwanId,
        sourceTunnelGroupId:      tunnelGroupId,
        sourceNetworkObjectId,
        sourceNetworkObjectGroupId,
        sourceNetworkDeviceId:    networkDeviceId,
        sourceMobileDeviceId:      mobileDeviceId,
        sourceChromebookId:        chromebookId,
        sourceZtnaClientId:        ztnaClientId,
        destinationScope:          destScopeVal,
        privateResourceId:         privResId,
        privateResourceGroupId:    privResGroupId,
        destinationListId:         destListId,
        networkObjectId:           netObjId,
        networkObjectGroupId:      netObjGroupId,
        serviceObjectId:           svcObjItemId,
        serviceObjectGroupId:      svcObjId,
        applicationId:             appId,
        protocolId,
        enterpriseApplicationId:   enterpriseAppId,
        applicationListId:         appListId,
        applicationCategoryId:     appCatId,
        contentCategoryId:         contentCatId,
        categoryListId:            catListId,
        geolocation:               geoVal,
        privateResourceType:       privateResourceTypeVal,
        appRiskProfileId,
        destination:               destParsed.ipCidr,
        destinationPort:           destParsed.port,
        preferredAction:           actionInput.value || "",
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
      destInput.value = "";
      actionInput.value = "";
      delete actionInput.dataset.selectedValue;
      actionCards.forEach(card => card.classList.remove("is-selected"));
      try { sessionStorage.removeItem(draftStorageKey); } catch (_) {}
      sourcePicker.resetAll();
      destPicker.resetAll();
      sourceAndPicker.resetAll();
      destAndPicker.resetAll();
      sourceAndWanted = false;
      destAndWanted = false;
      sourceAndWrap.hidden = true;
      destAndWrap.hidden = true;
      sourceAndToggle.hidden = true;
      destAndToggle.hidden = true;
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

    const summaryContainer = el("div", { id: "psc-audit-summary-container" });
    root.appendChild(summaryContainer);

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
            const typeMap = lookups.sourceIdentityTypeIds || {};
            const identityNames = (Array.isArray(values) ? values : [values]).map((id) => {
              const name = lookupItemName(lookups.identities, id) || "Deleted identity";
              const typeId = typeMap[String(id)];
              const type = typeId !== undefined
                ? (lookupItemName(lookups.identityTypes, typeId) || lookupItemName(DEFAULT_IDENTITY_TYPES, typeId) || `Type ${typeId}`)
                : null;
              return type ? `${name} (${type})` : name;
            });
            summaryText = `Source Identity: ${identityNames.join(", ")}`;
            break;
          }
          case "umbrella.source.identity_type_ids":
          case "umbrella.source.identity_type_ids_shared": {
            const typeNames = (Array.isArray(values) ? values : [values]).map((id) => {
              return lookupItemName(lookups.identityTypes, id) || lookupItemName(DEFAULT_IDENTITY_TYPES, id) || "Identity Type";
            });
            summaryText = `Identity Type: ${typeNames.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_ids": {
            const appMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.apps, id) || lookupItemName(lookups.protocols, id);
              appMatches.push(name || "Internet Application");
            }
            summaryText = `App: ${appMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_category_ids":
          case "umbrella.destination.category_ids": {
            const isApplicationCategory = type === "umbrella.destination.application_category_ids";
            const categoryMap = isApplicationCategory ? lookups.applicationCategories : lookups.categories;
            const fallback = isApplicationCategory ? "Application Category" : "Content Category";
            const catMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(categoryMap, id);
              catMatches.push(name || fallback);
            }
            summaryText = `${fallback}: ${catMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.private_resource_ids":
          case "umbrella.destination.private_resource_group_ids": {
            const resMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.privateResources, id) || lookupItemName(lookups.objects, id);
              resMatches.push(name || "Private Resource");
            }
            summaryText = `Private Resource: ${resMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.destination_list_ids": {
            const listMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.destinationLists, id);
              listMatches.push(name || "Destination List");
            }
            summaryText = `Destination List: ${listMatches.join(", ")}`;
            break;
          }
          case "umbrella.source.networkObjectIds":
          case "umbrella.source.networkObjectIds_shared": {
            const objMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.networkObjects, id);
              objMatches.push(name || "Network Object");
            }
            summaryText = `Network Object: ${objMatches.join(", ")}`;
            break;
          }
          case "umbrella.source.networkObjectGroupIds":
          case "umbrella.source.networkObjectGroupIds_shared": {
            const grpMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.networkObjects, id);
              grpMatches.push(name || "Network Group");
            }
            summaryText = `Network Group: ${grpMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.networkObjectGroupIds": {
            const grpMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.networkObjects, id);
              grpMatches.push(name || "Network Group");
            }
            summaryText = `Network Group: ${grpMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.serviceObjectIds": {
            const svcMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.serviceObjectGroups, id);
              svcMatches.push(name || "Service Group");
            }
            summaryText = `Service Group: ${svcMatches.join(", ")}`;
            break;
          }
          case "umbrella.destination.application_list_ids": {
            const listMatches = [];
            for (const id of Array.isArray(values) ? values : [values]) {
              const name = lookupItemName(lookups.applicationLists, id);
              listMatches.push(name || "Application List");
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
      lookups.sourceIdentityTypeIds = (objectMaps && objectMaps.sourceIdentityTypeIds) || {};
      lookups.objects = objectMap || {};
      lookups.privateResources = (objectMaps && objectMaps.privateResources) || objectMap || {};
      lookups.destinationLists = (objectMaps && objectMaps.destinationLists) || {};
      lookups.networkObjects   = (objectMaps && objectMaps.networkObjects) || {};
      lookups.serviceObjectGroups = (objectMaps && objectMaps.serviceObjectGroups) || {};
      lookups.applicationLists = (objectMaps && objectMaps.applicationLists) || {};
      lookups.categoryLists    = (objectMaps && objectMaps.categoryLists) || {};
      lookups.applicationCategories = (objectMaps && objectMaps.applicationCategories) || {};

      // Render Policy Audit & Overlap Summary Banner at top of Rules tab
      const allFindings = findings || [];
      const totalIssues = allFindings.length;
      const shadowCount = allFindings.filter(f => f.checkId === "shadowing").length;
      const dupCount = allFindings.filter(f => f.checkId && f.checkId.includes("duplicate")).length;
      const conflictCount = allFindings.filter(f => f.checkId && f.checkId.includes("conflict")).length;
      const permissiveCount = allFindings.filter(f => f.checkId && f.checkId.includes("permissive")).length;

      summaryContainer.innerHTML = "";
      const summaryCard = el("div", { class: "psc-audit-summary-card" });
      const summaryHeader = el("div", { class: "psc-audit-summary-header" }, [
        el("span", { class: "psc-audit-summary-title" }, ["Policy Audit & Overlap Summary"]),
        totalIssues > 0
          ? el("span", { class: "psc-audit-badge-warning" }, [`⚠️ ${totalIssues} Issue${totalIssues > 1 ? "s" : ""} Detected`])
          : el("span", { class: "psc-audit-badge-pass" }, ["✓ 100% Healthy"])
      ]);

      const statsRow = el("div", { class: "psc-audit-stats-row" }, [
        el("div", { class: "psc-audit-stat-chip" }, [
          el("span", { class: "psc-audit-stat-label" }, ["Total Rules:"]),
          el("span", { class: "psc-audit-stat-val" }, [String((rules || []).length)])
        ]),
        el("div", { class: `psc-audit-stat-chip ${shadowCount > 0 ? "has-issues" : ""}` }, [
          el("span", { class: "psc-audit-stat-label" }, ["Shadowed:"]),
          el("span", { class: "psc-audit-stat-val" }, [String(shadowCount)])
        ]),
        el("div", { class: `psc-audit-stat-chip ${dupCount > 0 ? "has-issues" : ""}` }, [
          el("span", { class: "psc-audit-stat-label" }, ["Duplicate:"]),
          el("span", { class: "psc-audit-stat-val" }, [String(dupCount)])
        ]),
        el("div", { class: `psc-audit-stat-chip ${conflictCount > 0 ? "has-issues" : ""}` }, [
          el("span", { class: "psc-audit-stat-label" }, ["Conflicting:"]),
          el("span", { class: "psc-audit-stat-val" }, [String(conflictCount)])
        ]),
        el("div", { class: `psc-audit-stat-chip ${permissiveCount > 0 ? "has-issues" : ""}` }, [
          el("span", { class: "psc-audit-stat-label" }, ["Permissive:"]),
          el("span", { class: "psc-audit-stat-val" }, [String(permissiveCount)])
        ]),
      ]);

      summaryCard.appendChild(summaryHeader);
      summaryCard.appendChild(statsRow);

      if (totalIssues > 0) {
        const detailsBox = el("details", { class: "psc-result-details", style: { marginTop: "6px" } });
        const summaryLabel = el("summary", { style: { fontSize: "10.5px", fontWeight: "600", color: "#c2410c", cursor: "pointer", fontFamily: "var(--hbr-font-family)" } }, [
          `▶ View overlap & conflict breakdown (${totalIssues})`
        ]);
        const issuesList = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" } });
        allFindings.forEach(f => {
          const fc = COLOR[f.severity] || COLOR.low;
          issuesList.appendChild(el("div", { class: "psc-check-item", style: { borderLeftColor: fc.text, background: fc.bg } }, [
            el("div", { class: "psc-check-item-head", style: { color: fc.text } }, [`[${f.checkId || "Audit"}] ${f.severity ? f.severity : ""}`]),
            el("span", { class: "psc-check-msg" }, [f.message]),
            f.detail ? el("span", { class: "psc-check-detail" }, [f.detail]) : null
          ].filter(Boolean)));
        });
        detailsBox.appendChild(summaryLabel);
        detailsBox.appendChild(issuesList);
        summaryCard.appendChild(detailsBox);
      }

      summaryContainer.appendChild(summaryCard);

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

        // Header Top Line: Priority Badge, Rule Name, Action Pill
        const actionCls = rAction === "allow" ? "psc-action-allow" : (rAction === "block" ? "psc-action-block" : "psc-action-isolate");
        const topBar = el("div", { class: "psc-rule-top-line" }, [
          el("span", { class: "psc-rule-prio" }, [`#${rPrio}`]),
          el("span", { class: "psc-rule-name" }, [rName]),
          el("span", { class: `psc-rule-action-pill ${actionCls}` }, [rAction.toUpperCase()]),
        ]);

        // Rich metadata row — description, ruleset, modified date, external ID
        const rawRule = rule.raw || rule;
        const metaFields = [];
        if (rawRule.ruleDescription) metaFields.push({ label: "DESC", value: rawRule.ruleDescription });
        if (rawRule.rulesetName) metaFields.push({ label: "RULESET", value: rawRule.rulesetName });
        if (rawRule.modifiedAt) {
          const d = new Date(rawRule.modifiedAt);
          metaFields.push({ label: "MODIFIED", value: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) });
        }
        if (rawRule.ruleExternalId) metaFields.push({ label: "EXT ID", value: String(rawRule.ruleExternalId) });
        if (rawRule.ruleIName) metaFields.push({ label: "I-NAME", value: rawRule.ruleIName });

        let metaRow = null;
        if (metaFields.length > 0) {
          metaRow = el("div", { class: "psc-rule-meta-row" });
          metaFields.slice(0, 3).forEach(m => {
            metaRow.appendChild(el("span", { class: "psc-rule-meta-chip" }, [`${m.label}: ${m.value}`]));
          });
        }

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

        // Add Security Profile Chips directly to header bar (dynamically read live ruleSettings)
        const sp = (function() {
          const settings = (rule.raw && rule.raw.ruleSettings) || rule.ruleSettings || [];
          const getVal = (pattern) => {
            const found = settings.find(s => s.settingName === pattern || (s.settingName && s.settingName.toLowerCase().includes(pattern.toLowerCase())));
            return found ? found.settingValue : undefined;
          };

          const ipsVal = getVal("ipsProfileId") || getVal("ips");
          const webVal = getVal("webProfileId") || getVal("tls") || getVal("decryption");
          const ampVal = getVal("profileIdClientbased") || getVal("profileIdClientless") || getVal("amp") || getVal("malware");
          const dlpVal = getVal("tenantControlProfileId") || getVal("dlp");

          const isReal = (v) => v !== undefined && v !== null && v !== "" && v !== "DISABLED" && v !== "NONE" && v !== false && v !== 0;
          const pre = rule.security_profiles || {};

          return {
            ips_enabled: isReal(ipsVal) || pre.ips_enabled === true,
            amp_malware_enabled: isReal(ampVal) || pre.amp_malware_enabled === true,
            tls_decryption_enabled: isReal(webVal) || pre.tls_decryption_enabled === true,
            dlp_enabled: isReal(dlpVal) || pre.dlp_enabled === true,
          };
        })();

        const makeSpChip = (label, enabled) => {
          return el("span", {
            class: "psc-chip",
            style: {
              background: enabled ? "#f0fdf4" : "#f8fafc",
              borderColor: enabled ? "#bbf7d0" : "#cbd5e1",
              color: enabled ? "#166534" : "#64748b",
              fontWeight: enabled ? "700" : "500"
            }
          }, [`${label}: ${enabled ? "ON" : "OFF"}`]);
        };
        inlineChips.appendChild(makeSpChip("IPS", sp.ips_enabled));
        inlineChips.appendChild(makeSpChip("AMP", sp.amp_malware_enabled));
        inlineChips.appendChild(makeSpChip("TLS", sp.tls_decryption_enabled));
        inlineChips.appendChild(makeSpChip("DLP", sp.dlp_enabled));

        const headerChildren = [topBar];
        if (metaRow) headerChildren.push(metaRow);
        headerChildren.push(inlineChips);

        const header = el("summary", { class: "psc-rule-group-header" }, headerChildren);

        card.appendChild(header);

        // Card Body
        const cardBody = el("div", { class: "psc-check-list" });

        // Findings / Audit Feedback section — render ONLY when issues exist
        if (ruleFindings.length > 0) {
          const findingsBox = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } });
          ruleFindings.forEach(f => {
            const fc = COLOR[f.severity] || COLOR.low;
            findingsBox.appendChild(el("div", { class: "psc-check-item", style: { borderLeftColor: fc.text, background: fc.bg } }, [
              el("div", { class: "psc-check-item-head", style: { color: fc.text } }, [`[AUDIT ISSUE: ${f.checkId.toUpperCase()}] — ${f.severity.toUpperCase()}`]),
              el("span", { class: "psc-check-msg" }, [f.message]),
              f.detail ? el("span", { class: "psc-check-detail" }, [f.detail]) : null
            ].filter(Boolean)));
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