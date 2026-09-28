# Secure Access Policy Checker

A Chrome extension that overlays the **Cisco Secure Access** dashboard to analyze access policy rules in real time. It intercepts dashboard API calls, resolves identity/destination/application names, and highlights rule issues (shadowing, duplicates, overly permissive allows) directly in the policy UI.

## Install

1. Clone this repo
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` directory

## How it works

The extension runs a service worker that intercepts the dashboard's SSE token when you visit `dashboard.sse.cisco.com`. It then fetches rules, identities, identity types, and destination objects from the Cisco APIs and stores them locally. The popup reads from local storage to render a policy overview with resolved names and flagged issues.

## Policy Checker

On the dashboard's policy page, the shield button opens the checker. It predicts which rule a request hits at each enforcement point, like Umbrella's policy tester:

| Connection | Sources you can give | Stages evaluated |
|---|---|---|
| Secure Client | Roaming computer, user or group | DNS → Web |
| On-prem VA | Site, internal client IP, user or group, egress network | DNS |
| Site-to-site tunnel | Network tunnel, internal client IP, user or group | DNS → Firewall → Web |

- The request carries every identity you fill in. A rule's source matches if any of them, or any AD group they belong to (nested groups included), is listed on the rule.
- A domain is checked at DNS and then at Web over HTTPS. A URL uses its own port. An IP address includes the firewall on a tunnel, with the port and protocol you give.
- Destinations that match a configured private resource, or an internal (RFC 1918 / ULA) address, are evaluated as Private Access.
- A block stops the later stages ("Not reached").
- If a higher-priority rule depends on something a domain alone doesn't reveal (its content category, application, or location), the checker asks which of that rule's values apply, then continues.
- **Show on page** marks each matched rule row on the dashboard with its stages and action, and docks a compact result card while the panel is minimized.

Results are predictions from the loaded rules, not observed traffic. Security-profile controls (file inspection, tenant controls, and so on) can still change the final event.

## Tests

```
node test-traffic-path.js      # Policy Checker model through the real matcher
node test-matcher.js
node test-policy-regressions.js
node test-checks.js
node test-membership.js
node test-taxonomy.js
```

## Repo structure

```
extension/
├── manifest.json              # MV3 manifest
├── background/
│   └── service-worker.js      # Token capture, API fetching, data resolution
├── content/
│   ├── content-script.js      # Dashboard overlay: panel, hover cards, rule highlight, result card
│   ├── token-sniffer.js       # Intercepts auth tokens from dashboard responses
│   ├── styles.css             # Dashboard overlay styles
│   └── token-relay.js         # Relays captured tokens to the service worker
├── popup/
│   ├── popup.html             # Extension popup UI (also embedded in the dashboard panel)
│   ├── popup.js               # Popup logic, reads from chrome.storage
│   ├── traffic-path.js        # Policy Checker model: connections, stages, evaluation
│   ├── traffic-path-panel.js  # Policy Checker UI
│   ├── traffic-path.css       # Policy Checker styles
│   ├── matcher.js             # Rule condition matching and label resolution
│   ├── ip-address.js          # IPv4/IPv6 and CIDR parsing
│   ├── tester-taxonomy.js     # Destination value classification
│   └── popup-sections.js      # Rules & Audit tab
├── lib/
│   └── debug-log.js           # Persistent debug logging
└── data/
    ├── apps-lookup.json        # Application ID → name mappings
    ├── categories-lookup.json  # Category ID → name mappings
    └── protocols-lookup.json   # Protocol number → name mappings
```
