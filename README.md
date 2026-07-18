# Secure Access Policy Checker

A Chrome extension that overlays the **Cisco Secure Access** dashboard to analyze access policy rules in real time. It intercepts dashboard API calls, resolves identity/destination/application names, and highlights rule issues (shadowing, duplicates, overly permissive allows) directly in the policy UI.

## Install

1. Clone this repo
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` directory

## How it works

The extension runs a service worker that intercepts the dashboard's SSE token when you visit `dashboard.sse.cisco.com`. It then fetches rules, identities, identity types, and destination objects from the Cisco APIs and stores them locally. The popup reads from local storage to render a policy overview with resolved names and flagged issues.

## Repo structure

```
extension/
├── manifest.json              # MV3 manifest
├── background/
│   └── service-worker.js      # Token capture, API fetching, data resolution
├── content/
│   ├── content-script.js      # Injected into the dashboard page
│   ├── token-sniffer.js       # Intercepts auth tokens from dashboard responses
│   ├── styles.css             # Dashboard overlay styles
│   └── token-relay.js         # Relays captured tokens to the service worker
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Popup logic, reads from chrome.storage
│   ├── matcher.js             # Rule condition matching and label resolution
│   └── popup-sections.js      # Renders rule source/destination/app sections
├── lib/
│   └── debug-log.js           # Persistent debug logging
└── data/
    ├── apps-lookup.json        # Application ID → name mappings
    ├── categories-lookup.json  # Category ID → name mappings
    └── protocols-lookup.json   # Protocol number → name mappings
```
