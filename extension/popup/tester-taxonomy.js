// ---------------------------------------------------------------------------
// tester-taxonomy.js — source/destination taxonomy + combination gating for
// the Policy Match Tester.
//
// Pure logic only (no DOM) so it is unit-testable from Node. Loaded before
// popup-sections.js; exposes window.TesterTaxonomy.
//
// Grounding (Cisco DevNet, "About access rule attributes"):
//   - umbrella.source.identity_ids and umbrella.source.identity_type_ids are
//     separate source attributes → identity and device facets.
//   - umbrella.source.ip_address is a composite (rule-local) source; Network
//     Objects / Groups are reusable source components → a distinct location
//     facet from a raw client IP.
//   - multiple source components combine through
//     umbrella.source.logical_operator (AND), so more than one source kind can
//     appear on a rule — but only where a rule can actually express it.
//   - umbrella.destination.* is a single destination dimension; port and
//     protocol were deprecated as standalone attributes into
//     composite_inline_ips, which is modelled here as one "IP + port +
//     protocol" option.
// ---------------------------------------------------------------------------

(function (root) {
  "use strict";

  // -------------------------------------------------------------------------
  // SOURCE taxonomy
  // -------------------------------------------------------------------------
  var SOURCE_KINDS = ["identity", "device", "ip", "network"];

  // Which facet each source tree option belongs to. Options sharing a kind are
  // alternatives within that facet (and stay mutually combinable).
  var SOURCE_FIELD_KIND = {
    // Users
    anyUser: "identity",
    users: "identity",
    gsuiteUsers: "identity",
    // Groups / OUs
    anyGroup: "identity",
    groups: "identity",
    gsuiteOus: "identity",
    // Device identity
    anyRoaming: "device",
    roaming: "device",
    mobileDevices: "device",
    chromebooks: "device",
    endpointDevices: "device",
    // Networks
    networks: "network",
    sites: "network",
    tunnelGroups: "network",
    networkDevices: "network",
    catalystSdwan: "network",
    networkObjects: "network",
    networkObjectGroups: "network",
    // IP / CIDR is carried by the typed address field, not a catalog.
    sourceIpCidr: "ip",
  };

  var SOURCE_TYPED_KIND = "ip";

  var DISALLOWED_SOURCE_PAIRS = [
    {
      pair: ["ip", "network"],
      reason:
        "IP / CIDR and Networks both describe where the traffic comes from. A rule scopes to one location, so pick one of them.",
    },
    {
      pair: ["device", "ip"],
      reason:
        "No verified rule shape combines a device identity with a raw client IP on the same source. Blocked conservatively.",
    },
  ];

  // -------------------------------------------------------------------------
  // DESTINATION taxonomy — exactly one kind may be active.
  // -------------------------------------------------------------------------
  var DEST_KINDS = ["fqdn", "ip", "ipport", "destList", "any"];

  var DEST_TYPED_KINDS = ["fqdn", "ip", "ipport"];

  var DEST_KIND_LABEL = {
    fqdn: "FQDN",
    ip: "IP / CIDR",
    ipport: "IP + port + protocol",
    destList: "Destination list",
    any: "Any destination",
  };

  var REASON = {
    DEST_SINGLE:
      "Destination accepts exactly one kind. Clear the current destination first.",
    DEST_LIST_ACTION: "Destination lists apply to Block rules only.",
    DEST_LIST_NEEDS_BLOCK: "Choose the Block action to use destination lists.",
    SOURCE_LOCATION_CONFLICT: "",
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function pairKey(a, b) {
    return [a, b].slice().sort().join("+");
  }

  var DISALLOWED_PAIR_MAP = (function () {
    var map = {};
    DISALLOWED_SOURCE_PAIRS.forEach(function (entry) {
      map[pairKey(entry.pair[0], entry.pair[1])] = entry.reason;
    });
    return map;
  })();

  function unique(list) {
    return Array.from(new Set((list || []).filter(Boolean)));
  }

  function kindForSourceField(fieldKey) {
    return SOURCE_FIELD_KIND[fieldKey] || "";
  }

  // Why candidateKind cannot join activeKinds. "" means allowed.
  function sourceKindBlockReason(activeKinds, candidateKind) {
    if (!candidateKind) return "";
    var active = unique(activeKinds);
    if (active.indexOf(candidateKind) !== -1) return "";
    for (var i = 0; i < active.length; i++) {
      var reason = DISALLOWED_PAIR_MAP[pairKey(active[i], candidateKind)];
      if (reason) return reason;
    }
    return "";
  }

  function canCombineSourceKinds(activeKinds, candidateKind) {
    return sourceKindBlockReason(activeKinds, candidateKind) === "";
  }

  function activeSourceKinds(fieldKeys, hasTypedAddress) {
    var kinds = [];
    (fieldKeys || []).forEach(function (key) {
      var kind = kindForSourceField(key);
      if (kind) kinds.push(kind);
    });
    if (hasTypedAddress) kinds.push(SOURCE_TYPED_KIND);
    return unique(kinds);
  }

  // Gate one source option against the current selection. An option whose own
  // kind is already active always stays enabled, so it can be cleared.
  function sourceFieldGate(fieldKey, activeKinds) {
    var kind = kindForSourceField(fieldKey);
    if (!kind) return { enabled: true, reason: "" };
    var reason = sourceKindBlockReason(activeKinds, kind);
    return { enabled: !reason, reason: reason };
  }

  function combosOf(kinds) {
    var out = [];
    var total = 1 << kinds.length;
    for (var mask = 1; mask < total; mask++) {
      var set = [];
      for (var i = 0; i < kinds.length; i++) {
        if (mask & (1 << i)) set.push(kinds[i]);
      }
      out.push(set);
    }
    return out;
  }

  function comboAllowed(set) {
    for (var a = 0; a < set.length; a++) {
      for (var b = a + 1; b < set.length; b++) {
        if (DISALLOWED_PAIR_MAP[pairKey(set[a], set[b])]) return false;
      }
    }
    return true;
  }

  function allowedSourceCombinations() {
    return combosOf(SOURCE_KINDS).filter(comboAllowed);
  }

  function disallowedSourceCombinations() {
    return combosOf(SOURCE_KINDS)
      .filter(function (set) { return !comboAllowed(set); })
      .map(function (set) {
        var violations = [];
        for (var a = 0; a < set.length; a++) {
          for (var b = a + 1; b < set.length; b++) {
            var reason = DISALLOWED_PAIR_MAP[pairKey(set[a], set[b])];
            if (reason) violations.push({ pair: [set[a], set[b]], reason: reason });
          }
        }
        return { kinds: set, violations: violations };
      });
  }

  // -------------------------------------------------------------------------
  // Typed-value classification
  // -------------------------------------------------------------------------
  var IPV4_CIDR = /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/;
  var IPV4_PORT = /^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/;
  var BRACKET_V6_PORT = /^\[[0-9a-f:.]+\]:\d{1,5}$/i;
  var BARE_V6 = /^[0-9a-f]*:[0-9a-f:]+$/i;
  var FQDN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

  function isIpOrCidr(value) {
    var v = String(value || "").trim();
    if (!v) return false;
    if (IPV4_CIDR.test(v)) return true;
    if (v.indexOf("/") !== -1 && BARE_V6.test(v.split("/")[0])) return true;
    return BARE_V6.test(v);
  }

  function isIpWithPort(value) {
    var v = String(value || "").trim();
    return IPV4_PORT.test(v) || BRACKET_V6_PORT.test(v);
  }

  // Split an optional trailing protocol suffix, e.g. "10.0.0.5:443/tcp".
  function splitProtocolSuffix(value) {
    var v = String(value || "").trim();
    var m = v.match(/^(.*)\/([a-z][a-z0-9]*)$/i);
    if (m) return { base: m[1], protocol: m[2] };
    return { base: v, protocol: "" };
  }

  function isFqdn(value) {
    var v = String(value || "").trim();
    if (!v) return false;
    var host = v.split("/")[0].split(":")[0];
    // A bare IPv4 must never be read as a dotted hostname.
    if (IPV4_CIDR.test(host) || IPV4_PORT.test(host)) return false;
    return FQDN.test(host);
  }

  // Classify a typed destination value into a destination kind. "" = unusable.
  function classifyDestinationValue(value) {
    var v = String(value || "").trim();
    if (!v) return "";
    // "address:port/protocol" is the L4 composite; the suffix only counts when
    // the part before it really is an address:port.
    var sp = splitProtocolSuffix(v);
    if (sp.protocol && isIpWithPort(sp.base)) return "ipport";
    if (isIpWithPort(v)) return "ipport";
    if (isIpOrCidr(v)) return "ip";
    if (isFqdn(v)) return "fqdn";
    return "";
  }

  // Classify a typed source value. Cisco only has a composite source IP, so a
  // domain is not a valid source.
  function classifySourceValue(value) {
    var v = String(value || "").trim();
    if (!v) return "";
    return isIpOrCidr(v) ? "ip" : "";
  }

  function destKindAcceptsValue(kind, value) {
    var v = String(value || "").trim();
    if (!v) return true;
    var actual = classifyDestinationValue(v);
    if (!actual) return false;
    if (kind === "ipport") return actual === "ipport" || actual === "ip";
    return actual === kind;
  }

  // Split an "address:port" composite into matcher fields.
  function splitIpPort(value) {
    var sp = splitProtocolSuffix(value);
    var v = sp.base;
    var bracket = v.match(/^\[([0-9a-f:.]+)\]:(\d{1,5})$/i);
    if (bracket) return { address: bracket[1], port: bracket[2], protocol: sp.protocol };
    var m = v.match(/^(.+):(\d{1,5})$/);
    if (m && isIpOrCidr(m[1])) return { address: m[1], port: m[2], protocol: sp.protocol };
    return { address: v, port: "", protocol: sp.protocol };
  }

  var api = {
    SOURCE_KINDS: SOURCE_KINDS,
    SOURCE_TYPED_KIND: SOURCE_TYPED_KIND,
    SOURCE_FIELD_KIND: SOURCE_FIELD_KIND,
    DISALLOWED_SOURCE_PAIRS: DISALLOWED_SOURCE_PAIRS,
    DEST_KINDS: DEST_KINDS,
    DEST_TYPED_KINDS: DEST_TYPED_KINDS,
    DEST_KIND_LABEL: DEST_KIND_LABEL,
    REASON: REASON,
    kindForSourceField: kindForSourceField,
    sourceKindBlockReason: sourceKindBlockReason,
    canCombineSourceKinds: canCombineSourceKinds,
    activeSourceKinds: activeSourceKinds,
    sourceFieldGate: sourceFieldGate,
    allowedSourceCombinations: allowedSourceCombinations,
    disallowedSourceCombinations: disallowedSourceCombinations,
    classifyDestinationValue: classifyDestinationValue,
    splitProtocolSuffix: splitProtocolSuffix,
    classifySourceValue: classifySourceValue,
    destKindAcceptsValue: destKindAcceptsValue,
    splitIpPort: splitIpPort,
    isIpOrCidr: isIpOrCidr,
    isFqdn: isFqdn,
  };

  root.TesterTaxonomy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
