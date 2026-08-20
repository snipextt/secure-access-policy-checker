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

      .psc-tester-guide {
        margin: 0;
        padding: 9px 10px;
        border-left: 3px solid #64748b;
        background: #ffffff;
        color: #475569;
        font-size: 10.5px;
        line-height: 1.45;
        font-family: var(--hbr-font-family);
      }
      .psc-tester-guide strong { color: #0f172a; }

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

  function createSearchableSelect(labelStr, hintStr, inputId, itemsObj, catalogStatus = itemsObj === undefined ? "loading" : null) {
    const wrapper = el("div", { class: "psc-dropdown-wrapper" });
    const input = el("input", {
      id: inputId,
      type: "text",
      class: "psc-dropdown-input",
      placeholder: hintStr || "Type to search by name...",
      autocomplete: "off",
    });

    let currentItemsObj = itemsObj || {};
    let keys = Object.keys(currentItemsObj);

    const list = el("ul", { class: "psc-dropdown-list" });
    let selectedValue = "";

    function getItemLabel(item, fallbackKey) {
      if (item === undefined || item === null) return String(fallbackKey || "");
      if (typeof item === "string") return item;
      if (typeof item === "object") {
        return item.name || item.label || item.displayName || String(fallbackKey || "");
      }
      return String(item);
    }

    function renderList(query) {
      list.innerHTML = "";
      const q = (query || "").toLowerCase();
      const matches = keys.filter(k => {
        const item = currentItemsObj[k];
        const label = getItemLabel(item, k);
        return k.toLowerCase().includes(q) || label.toLowerCase().includes(q);
      }).slice(0, 500);

      if (matches.length === 0) {
        const emptyText = catalogStatus === "loading"
          ? "Loading catalog…"
          : catalogStatus === "unavailable"
            ? "Catalog unavailable — refresh the dashboard"
            : `No ${labelStr.toLowerCase()} configured`;
        list.appendChild(el("li", { style: { color: "#94a3b8", cursor: "default" } }, [emptyText]));
        return;
      }

      matches.forEach(k => {
        const item = currentItemsObj[k];
        const labelStr = getItemLabel(item, k);
        const li = el("li", {}, [
          labelStr
        ]);
        const selectOption = (event) => {
          // Commit on pointer-down rather than waiting for click/blur ordering.
          // This makes clear → reselect reliable when the input is focused and
          // prevents an outside-dismiss listener from winning the race.
          event.preventDefault();
          event.stopPropagation();
          selectedValue = k;
          input.dataset.selectedValue = k;
          input.value = labelStr;
          list.style.display = "none";
          input.focus();
        };
        li.addEventListener("pointerdown", selectOption);
        list.appendChild(li);
      });
    }

    input.addEventListener("focus", () => {
      renderList(input.value);
      list.style.display = "block";
    });

    input.addEventListener("input", () => {
      selectedValue = "";
      delete input.dataset.selectedValue;
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

    function setItems(newItemsObj, enable = true) {
      currentItemsObj = newItemsObj || {};
      keys = Object.keys(currentItemsObj);
      if (enable) {
        input.disabled = false;
      }
    }

    return {
      element: container,
      wrapper,
      input,
      setItems,
      getValue: () => selectedValue || input.dataset.selectedValue || input.value.trim(),
      restore: (value, selected) => {
        selectedValue = selected || "";
        if (selectedValue) input.dataset.selectedValue = selectedValue;
        else delete input.dataset.selectedValue;
        input.value = value || "";
      },
      reset: () => {
        selectedValue = "";
        delete input.dataset.selectedValue;
        input.value = "";
      }
    };
  }

  function buildTesterPanel(container, identityOptions, objectMaps, identityTypeMap, identityMap, onRun, onReset) {
    injectStyles();

    // Catalog updates re-render this panel. Preserve which optional fields the
    // user enabled so a background refresh cannot make them appear to vanish.
    const fieldSettingsKey = "psc-enabled-filter-fields";
    let savedFieldSettings = {};
    try { savedFieldSettings = JSON.parse(sessionStorage.getItem(fieldSettingsKey) || "{}"); } catch (_) {}
    const savedEnabled = (section, key, fallback) =>
      Object.prototype.hasOwnProperty.call(savedFieldSettings[section] || {}, key)
        ? Boolean(savedFieldSettings[section][key])
        : fallback;

    const maps = objectMaps && typeof objectMaps === "object" ? objectMaps : {
      privateResources: objectMaps || {},
      destinationLists: {},
      networkObjects: {},
      serviceObjectGroups: {},
      applicationLists: {},
      categoryLists: {},
    };

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
    const persistDraft = () => {
      const fields = Array.from(panel.querySelectorAll("input, textarea, select"));
      const next = {};
      for (const field of fields) {
        if (!field.id) continue;
        next[field.id] = { value: field.value || "", selected: field.dataset && field.dataset.selectedValue || "" };
      }
      try { sessionStorage.setItem(draftStorageKey, JSON.stringify(next)); } catch (_) {}
    };
    const restoreDraft = () => {
      for (const [id, saved] of Object.entries(draft)) {
        const field = panel.querySelector(`#${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id}`);
        if (!field) continue;
        field.value = saved && saved.value || "";
        if (saved && saved.selected) field.dataset.selectedValue = saved.selected;
      }
    };
    panel.addEventListener("input", persistDraft);
    panel.addEventListener("change", persistDraft);

    const body = el("div", { id: "psc-panel-body" });
    const formRow = el("div", { id: "psc-form-row" });

    // Helper: wrap a plain input in a field group component object
    function createFieldGroup(labelStr, input) {
      const element = el("div", { class: "psc-field-group" }, [
        el("label", { class: "psc-field-label", htmlFor: input.id }, [labelStr]),
        input
      ]);
      return {
        element,
        input,
        getValue: () => input.value.trim(),
        reset: () => { input.value = ""; }
      };
    }

    // =========================================================================
    // 1. SOURCE SECTION COMPONENTS
    // =========================================================================
    const sourceInput = el("input", {
      id: "psc-src",
      type: "text",
      placeholder: "192.168.1.50:443 or CIDR (e.g. 10.0.0.0/16)",
      autocomplete: "off",
    });
    const srcIpField = createFieldGroup("Source IP / CIDR / Port", sourceInput);

    // These are named catalog items, not a second set of vague "identity
    // type" filters. Selecting a named AD User also satisfies a policy whose
    // source is "Any AD User"; the matcher uses the catalog's type map to do
    // that safely.
    const usersSelect = createSearchableSelect("AD Users", "Search AD user by name...", "psc-src-users", maps.sourceUsers);
    usersSelect.input.disabled = false;
    const roamingSelect = createSearchableSelect("Roaming Computers", "Search roaming computer by name...", "psc-src-roaming", maps.sourceRoaming);
    roamingSelect.input.disabled = false;
    const groupsSelect = createSearchableSelect("AD Groups", "Search AD group by name...", "psc-src-groups", maps.sourceGroups);
    groupsSelect.input.disabled = false;
    const endpointDevicesSelect = createSearchableSelect("AD Computers", "Search AD computer by name...", "psc-src-endpoints", maps.sourceEndpointDevices);
    endpointDevicesSelect.input.disabled = false;
    const networksSelect = createSearchableSelect("Networks", "Search network by name...", "psc-src-networks", maps.sourceNetworks);
    networksSelect.input.disabled = false;
    const sitesSelect = createSearchableSelect("Sites", "Search site by name...", "psc-src-sites", maps.sourceSites);
    sitesSelect.input.disabled = false;
    const sgtSelect = createSearchableSelect("Security Group Tags", "Search SGT by name...", "psc-src-sgt", maps.sourceSecurityGroupTags);
    sgtSelect.input.disabled = false;
    const catalystSdwanSelect = createSearchableSelect("Catalyst SD-WAN Service VPN IDs", "Search service VPN ID...", "psc-src-catalyst-sdwan", maps.sourceCatalystSdwan);
    catalystSdwanSelect.input.disabled = false;
    const tunnelGroupsSelect = createSearchableSelect("Network Tunnel Groups (Machine Tunnel)", "Search tunnel group by name...", "psc-src-tunnel-groups", maps.sourceTunnelGroups);
    tunnelGroupsSelect.input.disabled = false;
    const networkObjectsSelect = createSearchableSelect("Network Objects", "Catalog unavailable — no HAR-observed source condition", "psc-src-network-objects", {}, "unavailable");
    networkObjectsSelect.input.disabled = true;
    const networkObjectGroupsSelect = createSearchableSelect("Network Object Groups", "Catalog unavailable — no HAR-observed source condition", "psc-src-network-object-groups", {}, "unavailable");
    networkObjectGroupsSelect.input.disabled = true;
    const networkDevicesSelect = createSearchableSelect("Network Devices", "No devices configured in this organization", "psc-src-network-devices", maps.sourceNetworkDevices || {});
    networkDevicesSelect.input.disabled = false;
    const mobileDevicesSelect = createSearchableSelect("Mobile Devices", "Search mobile device by name...", "psc-src-mobile-devices", maps.sourceMobileDevices || {});
    mobileDevicesSelect.input.disabled = false;
    const chromebooksSelect = createSearchableSelect("Chromebooks", "Search Chromebook by name...", "psc-src-chromebooks", maps.sourceChromebooks || {});
    chromebooksSelect.input.disabled = false;
    const ztnaClientsSelect = createSearchableSelect("ZTNA Clients", "Search ZTNA client by name...", "psc-src-ztna-clients", maps.sourceZtnaClients || {});
    ztnaClientsSelect.input.disabled = false;

    const sourceInputMap = {
      users: usersSelect,
      roaming: roamingSelect,
      groups: groupsSelect,
      endpointDevices: endpointDevicesSelect,
      networks: networksSelect,
      sites: sitesSelect,
      sgt: sgtSelect,
      catalystSdwan: catalystSdwanSelect,
      tunnelGroups: tunnelGroupsSelect,
      networkObjects: networkObjectsSelect,
      networkObjectGroups: networkObjectGroupsSelect,
      networkDevices: networkDevicesSelect,
      mobileDevices: mobileDevicesSelect,
      chromebooks: chromebooksSelect,
      ztnaClients: ztnaClientsSelect,
    };

    const sourceSettingsToggles = {
      users: { label: "AD Users", enabled: savedEnabled("source", "users", true) },
      roaming: { label: "Roaming Computers", enabled: savedEnabled("source", "roaming", false) },
      groups: { label: "AD Groups", enabled: savedEnabled("source", "groups", false) },
      endpointDevices: { label: "AD Computers", enabled: savedEnabled("source", "endpointDevices", false) },
      networks: { label: "Networks", enabled: savedEnabled("source", "networks", false) },
      sites: { label: "Sites", enabled: savedEnabled("source", "sites", false) },
      sgt: { label: "Security Group Tags", enabled: savedEnabled("source", "sgt", false) },
      catalystSdwan: { label: "Catalyst SD-WAN Service VPN IDs", enabled: savedEnabled("source", "catalystSdwan", false) },
      tunnelGroups: { label: "Network Tunnel Groups (Machine Tunnel)", enabled: savedEnabled("source", "tunnelGroups", false) },
      // These are intentionally visible as unavailable rather than silently
      // removed: the supplied capture has no source-object condition to match.
      networkObjects: { label: "Network Objects — unavailable for source tests", enabled: savedEnabled("source", "networkObjects", false) },
      networkObjectGroups: { label: "Network Object Groups — unavailable for source tests", enabled: savedEnabled("source", "networkObjectGroups", false) },
      networkDevices: { label: "Network Devices", enabled: savedEnabled("source", "networkDevices", false) },
      mobileDevices: { label: "Mobile Devices", enabled: savedEnabled("source", "mobileDevices", false) },
      chromebooks: { label: "Chromebooks", enabled: savedEnabled("source", "chromebooks", false) },
      ztnaClients: { label: "ZTNA Clients", enabled: savedEnabled("source", "ztnaClients", false) },
    };

    // Source Section Box
    const srcBox = el("div", { class: "psc-section-box", id: "psc-src-box" });
    const srcSettingsToggle = el("button", { type: "button", class: "psc-section-toggle", id: "psc-src-settings-toggle" }, [
      el("span", {}, ["⚙ Fields"]),
      el("span", { class: "psc-settings-arrow" }, ["▼"])
    ]);
    const srcSettingsPopover = el("div", { class: "psc-section-popover", id: "psc-src-popover" });
    const srcEnabledContainer = el("div", { class: "psc-section-fields", id: "psc-src-enabled-fields" });

    function renderSourceFields() {
      srcEnabledContainer.innerHTML = "";
      Object.entries(sourceSettingsToggles).forEach(([key, cfg]) => {
        if (cfg.enabled) {
          const sel = sourceInputMap[key];
          if (sel && sel.element) srcEnabledContainer.appendChild(sel.element);
        }
      });
    }

    Object.entries(sourceSettingsToggles).forEach(([key, cfg]) => {
      const toggle = el("div", { class: "psc-setting-toggle" + (cfg.enabled ? " active" : ""), "data-setting": key });
      toggle.addEventListener("click", () => {
        toggle.classList.toggle("active");
        const isActive = toggle.classList.contains("active");
        cfg.enabled = isActive;
        savedFieldSettings.source = { ...(savedFieldSettings.source || {}), [key]: isActive };
        try { sessionStorage.setItem(fieldSettingsKey, JSON.stringify(savedFieldSettings)); } catch (_) {}
        if (sourceInputMap[key] && sourceInputMap[key].input) {
          sourceInputMap[key].input.disabled = !isActive;
        }
        renderSourceFields();
      });
      srcSettingsPopover.appendChild(el("div", { class: "psc-setting-row" }, [
        el("label", { class: "psc-setting-label" }, [cfg.label]),
        toggle
      ]));
    });

    srcSettingsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      dstSettingsPopover.classList.remove("open");
      srcSettingsPopover.classList.toggle("open");
    });

    const srcHeader = el("div", { class: "psc-section-header" }, [
      el("span", { class: "psc-section-title" }, ["Source"]),
      srcSettingsToggle
    ]);

    srcBox.appendChild(srcHeader);
    srcBox.appendChild(srcSettingsPopover);
    srcBox.appendChild(el("p", { class: "psc-tester-guide" }, [
      el("strong", {}, ["Choose a named source. "]),
      "A named AD user, group, roaming computer, tunnel group, or other catalog item can satisfy a policy such as “Any AD User” or “Any Network Tunnel.” Type-only policy labels without a named catalog item — such as Posture, OS, or Endpoint Requirements — remain visible on the policy but cannot be independently simulated."
    ]));
    srcBox.appendChild(srcIpField.element);
    srcBox.appendChild(srcEnabledContainer);

    // =========================================================================
    // 2. DESTINATION SECTION COMPONENTS
    // =========================================================================
    const destInput = el("input", {
      id: "psc-dest",
      type: "text",
      placeholder: "10.0.0.1:80 or Domain (e.g. cisco.com:443)",
      autocomplete: "off",
    });
    const dstIpField = createFieldGroup("Destination IP / Domain / Port", destInput);

    const destScopeSelect = createSearchableSelect("Destination Scope", "Search destination scope by name...", "psc-dst-scope", maps.destinationScopes || {});
    destScopeSelect.input.disabled = false;
    const privResSelect = createSearchableSelect("Private Resources", "Search private resources by name...", "psc-privres", maps.privateResources || {});
    privResSelect.input.disabled = false;
    const privResGroupSelect = createSearchableSelect("Private Resource Groups", "Search resource groups by name...", "psc-privresgrp", maps.privateResourceGroups || {});
    privResGroupSelect.input.disabled = false;
    const destListSelect = createSearchableSelect("Destination Lists", "Search destination lists by name...", "psc-destlist", maps.destinationLists || {});
    destListSelect.input.disabled = false;
    const netObjSelect = createSearchableSelect("Network Objects", "Search network objects by name...", "psc-netobj", maps.networkObjects || {});
    netObjSelect.input.disabled = false;
    const svcObjSelect = createSearchableSelect("Service Object Groups", "Search service groups by name...", "psc-svcobj", maps.serviceObjectGroups || {});
    svcObjSelect.input.disabled = false;
    const appSelect = createSearchableSelect("Internet Applications", "Search internet applications by name...", "psc-app", maps.internetApplications || maps.applications || {});
    appSelect.input.disabled = false;
    const protocolSelect = createSearchableSelect("Application Protocols", "Search protocol signatures by name...", "psc-protocol", maps.applicationProtocols || {});
    protocolSelect.input.disabled = false;
    const enterpriseAppSelect = createSearchableSelect("Enterprise Applications", "Search enterprise applications by name...", "psc-enterprise-app", maps.enterpriseApplications || {});
    enterpriseAppSelect.input.disabled = false;
    const appListSelect = createSearchableSelect("Application Lists", "Search application lists by name...", "psc-applist", maps.applicationLists || {});
    appListSelect.input.disabled = false;
    const appCatSelect = createSearchableSelect("Application Categories", "Search application categories by name...", "psc-appcat", maps.applicationCategories || {});
    appCatSelect.input.disabled = false;
    const contentCatSelect = createSearchableSelect("Content Categories", "Search content categories by name...", "psc-content-cat", maps.contentCategories || {});
    contentCatSelect.input.disabled = false;
    const catListSelect = createSearchableSelect("Category Lists", "Search category lists by name...", "psc-catlist", maps.categoryLists || {});
    catListSelect.input.disabled = false;
    const geolocationSelect = createSearchableSelect("Geolocations", "Search country by name or code...", "psc-geolocation", maps.geolocations || {});
    geolocationSelect.input.disabled = false;
    const privateResourceTypeSelect = createSearchableSelect("Private Resource Kind", "Applications or networks...", "psc-privres-type", { apps: "Applications", networks: "Networks" });
    privateResourceTypeSelect.input.disabled = false;
    const appRiskProfileSelect = createSearchableSelect("App Risk Profile", "Search app risk profile...", "psc-app-risk", maps.appRiskProfiles || {});
    appRiskProfileSelect.input.disabled = false;

    const destInputMap = {
      destScope: destScopeSelect,
      privateResource: privResSelect,
      privateResourceGroup: privResGroupSelect,
      destinationList: destListSelect,
      netObject: netObjSelect,
      serviceObject: svcObjSelect,
      application: appSelect,
      protocol: protocolSelect,
      enterpriseApplication: enterpriseAppSelect,
      appList: appListSelect,
      appCategory: appCatSelect,
      contentCategory: contentCatSelect,
      catList: catListSelect,
      geolocation: geolocationSelect,
      privateResourceType: privateResourceTypeSelect,
      appRiskProfile: appRiskProfileSelect,
    };

    const destSettingsToggles = {
      destScope: { label: "Destination Scope", enabled: savedEnabled("destination", "destScope", true) },
      privateResource: { label: "Private Resources", enabled: savedEnabled("destination", "privateResource", false) },
      privateResourceGroup: { label: "Private Resource Groups", enabled: savedEnabled("destination", "privateResourceGroup", false) },
      destinationList: { label: "Destination Lists", enabled: savedEnabled("destination", "destinationList", false) },
      netObject: { label: "Network Objects", enabled: savedEnabled("destination", "netObject", false) },
      serviceObject: { label: "Service Object Groups", enabled: savedEnabled("destination", "serviceObject", false) },
      application: { label: "Internet Applications", enabled: savedEnabled("destination", "application", false) },
      protocol: { label: "Application Protocols", enabled: savedEnabled("destination", "protocol", false) },
      enterpriseApplication: { label: "Enterprise Applications", enabled: savedEnabled("destination", "enterpriseApplication", false) },
      appList: { label: "Application Lists", enabled: savedEnabled("destination", "appList", false) },
      appCategory: { label: "Application Categories", enabled: savedEnabled("destination", "appCategory", false) },
      contentCategory: { label: "Content Categories", enabled: savedEnabled("destination", "contentCategory", false) },
      catList: { label: "Category Lists", enabled: savedEnabled("destination", "catList", false) },
      geolocation: { label: "Geolocations", enabled: savedEnabled("destination", "geolocation", false) },
      privateResourceType: { label: "Private Resource Kind (rule classifier)", enabled: savedEnabled("destination", "privateResourceType", false) },
      appRiskProfile: { label: "App Risk Profile", enabled: savedEnabled("destination", "appRiskProfile", false) },
    };

    // Destination Section Box
    const dstBox = el("div", { class: "psc-section-box", id: "psc-dst-box" });
    const dstSettingsToggle = el("button", { type: "button", class: "psc-section-toggle", id: "psc-dst-settings-toggle" }, [
      el("span", {}, ["⚙ Fields"]),
      el("span", { class: "psc-settings-arrow" }, ["▼"])
    ]);
    const dstSettingsPopover = el("div", { class: "psc-section-popover", id: "psc-dst-popover" });
    const dstEnabledContainer = el("div", { class: "psc-section-fields", id: "psc-dst-enabled-fields" });

    function renderDestFields() {
      dstEnabledContainer.innerHTML = "";
      Object.entries(destSettingsToggles).forEach(([key, cfg]) => {
        if (cfg.enabled) {
          const sel = destInputMap[key];
          if (sel && sel.element) dstEnabledContainer.appendChild(sel.element);
        }
      });
    }

    Object.entries(destSettingsToggles).forEach(([key, cfg]) => {
      const toggle = el("div", { class: "psc-setting-toggle" + (cfg.enabled ? " active" : ""), "data-setting": key });
      toggle.addEventListener("click", () => {
        toggle.classList.toggle("active");
        const isActive = toggle.classList.contains("active");
        cfg.enabled = isActive;
        savedFieldSettings.destination = { ...(savedFieldSettings.destination || {}), [key]: isActive };
        try { sessionStorage.setItem(fieldSettingsKey, JSON.stringify(savedFieldSettings)); } catch (_) {}
        if (destInputMap[key] && destInputMap[key].input) {
          destInputMap[key].input.disabled = !isActive;
        }
        renderDestFields();
      });
      dstSettingsPopover.appendChild(el("div", { class: "psc-setting-row" }, [
        el("label", { class: "psc-setting-label" }, [cfg.label]),
        toggle
      ]));
    });

    dstSettingsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      srcSettingsPopover.classList.remove("open");
      dstSettingsPopover.classList.toggle("open");
    });

    const dstHeader = el("div", { class: "psc-section-header" }, [
      el("span", { class: "psc-section-title" }, ["Destination"]),
      dstSettingsToggle
    ]);

    dstBox.appendChild(dstHeader);
    dstBox.appendChild(dstSettingsPopover);
    dstBox.appendChild(el("p", { class: "psc-tester-guide" }, [
      el("strong", {}, ["Pick the destination being reached. "]),
      "Private Resources are the configured intranet apps, networks, or websites. Destination Scope distinguishes Internet from Private Access. Resource Type is only a rule classifier; use a named private resource or group whenever one is configured."
    ]));
    dstBox.appendChild(dstIpField.element);
    dstBox.appendChild(dstEnabledContainer);

    // Close field-settings menus whenever the press starts outside their menu
    // and trigger. Capture phase makes this independent of stopped bubble
    // events inside searchable selects and dynamically moved field controls.
    document.addEventListener("pointerdown", (e) => {
      if (!srcSettingsPopover.contains(e.target) && !srcSettingsToggle.contains(e.target)) {
        srcSettingsPopover.classList.remove("open");
      }
      if (!dstSettingsPopover.contains(e.target) && !dstSettingsToggle.contains(e.target)) {
        dstSettingsPopover.classList.remove("open");
      }
    }, true);

    // Grid row containing SOURCE on left, DESTINATION on right
    const criteriaGrid = el("div", { class: "psc-criteria-grid" }, [
      srcBox,
      dstBox
    ]);

    formRow.appendChild(criteriaGrid);
    body.appendChild(formRow);

    renderSourceFields();
    renderDestFields();


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
      const usersId = usersSelect.getValue();
      const roamingId = roamingSelect.getValue();
      const groupsId = groupsSelect.getValue();
      const endpointDevicesId = endpointDevicesSelect.getValue();
      const networksId = networksSelect.getValue();
      const sitesId = sitesSelect.getValue();
      const sgtId = sgtSelect.getValue();
      const catalystSdwanId = catalystSdwanSelect.getValue();
      const tunnelGroupId = tunnelGroupsSelect.getValue();
      const sourceNetworkObjectId = networkObjectsSelect.getValue();
      const sourceNetworkObjectGroupId = networkObjectGroupsSelect.getValue();
      const mobileDeviceId = mobileDevicesSelect.getValue();
      const chromebookId = chromebooksSelect.getValue();
      const ztnaClientId = ztnaClientsSelect.getValue();
      const networkDeviceId = networkDevicesSelect.getValue();
      const destScopeVal = destScopeSelect.getValue();
      const privResId = privResSelect.getValue();
      const privResGroupId = privResGroupSelect.getValue();
      const destListId = destListSelect.getValue();
      const netObjId = netObjSelect.getValue();
      const svcObjId = svcObjSelect.getValue();
      const appId = appSelect.getValue();
      const protocolId = protocolSelect.getValue();
      const enterpriseAppId = enterpriseAppSelect.getValue();
      const appListId = appListSelect.getValue();
      const appCatId = appCatSelect.getValue();
      const contentCatId = contentCatSelect.getValue();
      const catListId = catListSelect.getValue();
      const geoVal = geolocationSelect.getValue();
      const privateResourceTypeVal = privateResourceTypeSelect.getValue();
      const appRiskProfileId = appRiskProfileSelect.getValue();

      if (!srcVal && !destVal && !usersId && !roamingId && !groupsId && !endpointDevicesId && !networksId && !sitesId && !sgtId && !catalystSdwanId && !tunnelGroupId && !sourceNetworkObjectId && !sourceNetworkObjectGroupId && !networkDeviceId && !mobileDeviceId && !chromebookId && !ztnaClientId && !destScopeVal && !privResId && !privResGroupId && !destListId && !netObjId && !svcObjId && !appId && !protocolId && !enterpriseAppId && !appListId && !appCatId && !contentCatId && !catListId && !geoVal && !privateResourceTypeVal && !appRiskProfileId) {
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
      try { sessionStorage.removeItem(draftStorageKey); } catch (_) {}
      usersSelect.reset();
      roamingSelect.reset();
      groupsSelect.reset();
      endpointDevicesSelect.reset();
      networksSelect.reset();
      sitesSelect.reset();
      sgtSelect.reset();
      catalystSdwanSelect.reset();
      tunnelGroupsSelect.reset();
      networkObjectsSelect.reset();
      networkObjectGroupsSelect.reset();
      networkDevicesSelect.reset();
      mobileDevicesSelect.reset();
      chromebooksSelect.reset();
      ztnaClientsSelect.reset();
      destScopeSelect.reset();
      privResSelect.reset();
      privResGroupSelect.reset();
      destListSelect.reset();
      netObjSelect.reset();
      svcObjSelect.reset();
      appSelect.reset();
      protocolSelect.reset();
      enterpriseAppSelect.reset();
      appListSelect.reset();
      appCatSelect.reset();
      contentCatSelect.reset();
      catListSelect.reset();
      geolocationSelect.reset();
      privateResourceTypeSelect.reset();
      appRiskProfileSelect.reset();
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
              const name = lookupItemName(lookups.identities, id) || "Identity";
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