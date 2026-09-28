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
| On-prem VA | Site, internal client IP, user or group, AD computer, egress network | DNS |
| Network DNS | Registered network (public IP) | DNS |
| Site-to-site tunnel | Network tunnel, internal client IP, user or group, AD computer, SD-WAN VPN, security group tag | Firewall → Web |

- The request carries every identity you fill in. A rule's source matches if any of them, or any AD group they belong to (nested groups included), is listed on the rule.
- A rule's destinations are alternatives: the request matches if it hits any one of them.
- Branch DNS doesn't travel through the tunnel; check it with On-prem VA or Network DNS.
- A domain is checked at DNS and then at Web over HTTPS. A URL uses its own port. An IP address includes the firewall on a tunnel, with the port and protocol you give.
- Destinations that match a configured private resource, or an internal (RFC 1918 / ULA) address, are evaluated as Private Access. From a tunnel, an internal IP goes through the firewall under the private-access rules.
- A firewall block stops the later stages ("Not reached"). After a DNS block, Web is still shown as the fallback, because DNS may not know the user.
- If a higher-priority rule depends on something a domain alone doesn't reveal (its content category, application, or location), the checker asks which of that rule's values apply, then continues.
- **Show on page** marks each matched rule row on the dashboard with its stages and action, and docks a compact result card while the panel is minimized.

Results are predictions from the loaded rules, not observed traffic. Security-profile controls (malware and threat categories, file inspection, tenant controls, IPS) can still block traffic an Allow rule matched, and DNS security settings can block before any rule.

## QA against Activity Search

Replays a real Activity Search export through the checker (form, model and matcher) against the tenant's live rules, and compares the predicted layer and rule with what was logged. Tenant data stays in `qa/data/`, which is git-ignored.

```
python3 qa/export-to-jsonl.py export.xlsx              # → qa/data/events.jsonl
node qa/dump-extension-data.mjs 9444 dump qa/data/extension-data.json   # from a signed-in Chrome, see the file header
node qa/replay-activity.mjs                            # prints accuracy per layer and rule
```

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
    ├── categories-lookup.json  # Content category bit position → category ID and name
    └── protocols-lookup.json   # Protocol number → name mappings
qa/
├── export-to-jsonl.py         # Activity Search export (.xlsx/.csv) → JSON Lines
├── dump-extension-data.mjs    # Read rules + catalogs from a signed-in Chrome
└── replay-activity.mjs        # Replay events through the checker, report mismatches
```
