#!/usr/bin/env node
// =============================================================================
// test-taxonomy.js — source/destination taxonomy + combination gating.
//
// Covers the allowed/disallowed source combination matrix, the dynamic gate
// used by the picker, and typed destination classification (FQDN / IP /
// IP+port+protocol), which drives the single-destination rule.
//
// Run: node test-taxonomy.js
// =============================================================================

"use strict";

const assert = require("assert");
const T = require("./extension/popup/tester-taxonomy.js");

let passed = 0;
let failed = 0;

function ok(label, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${label}: ${err.message}`);
  }
}

function combo(...kinds) {
  return kinds.slice().sort().join("+");
}

console.log("\n=== Group 1: Allowed source combinations ===");

const allowed = T.allowedSourceCombinations().map((set) => combo(...set));
ok("allowed set is exactly the documented matrix", () => {
  assert.deepStrictEqual(allowed.slice().sort(), [
    "device",
    "device+identity",
    "device+network",
    "identity",
    "device+identity+network",
    "identity+ip",
    "identity+network",
    "ip",
    "network",
  ].sort());
});

console.log("\n=== Group 2: Disallowed source combinations ===");

const disallowed = T.disallowedSourceCombinations().map((d) => combo(...d.kinds));
ok("disallowed set is exactly the blocked matrix", () => {
  assert.deepStrictEqual(disallowed.slice().sort(), [
    "device+ip",
    "device+identity+ip",
    "device+ip+network",
    "device+identity+ip+network",
    "ip+network",
    "identity+ip+network",
  ].sort());
});

ok("every disallowed combo reports at least one violation with a reason", () => {
  T.disallowedSourceCombinations().forEach((entry) => {
    assert(entry.violations.length > 0, `no violation recorded for ${entry.kinds.join("+")}`);
    entry.violations.forEach((v) => assert(v.reason && v.reason.length > 10, "reason too short"));
  });
});

ok("allowed and disallowed partition all non-empty kind sets", () => {
  const total = (1 << T.SOURCE_KINDS.length) - 1;
  assert.strictEqual(allowed.length + disallowed.length, total);
});

console.log("\n=== Group 3: Pair-level rules ===");

ok("identity combines with device", () => assert.strictEqual(T.canCombineSourceKinds(["identity"], "device"), true));
ok("identity combines with network", () => assert.strictEqual(T.canCombineSourceKinds(["identity"], "network"), true));
ok("identity combines with ip", () => assert.strictEqual(T.canCombineSourceKinds(["identity"], "ip"), true));
ok("device combines with network", () => assert.strictEqual(T.canCombineSourceKinds(["device"], "network"), true));
ok("ip + network is blocked", () => assert.strictEqual(T.canCombineSourceKinds(["ip"], "network"), false));
ok("device + ip is blocked", () => assert.strictEqual(T.canCombineSourceKinds(["device"], "ip"), false));
ok("same kind stays selectable so it can be cleared", () => {
  assert.strictEqual(T.canCombineSourceKinds(["identity"], "identity"), true);
  assert.strictEqual(T.canCombineSourceKinds(["ip"], "ip"), true);
});
ok("block reason for ip+network names the conflict", () => {
  const reason = T.sourceKindBlockReason(["network"], "ip");
  assert(/IP \/ CIDR and Networks/.test(reason), reason);
});
ok("no active kinds means everything is allowed", () => {
  T.SOURCE_KINDS.forEach((kind) => {
    assert.strictEqual(T.sourceKindBlockReason([], kind), "");
  });
});

console.log("\n=== Group 4: Field → kind mapping ===");

ok("each source tree facet maps to its kind", () => {
  assert.strictEqual(T.kindForSourceField("users"), "identity");
  assert.strictEqual(T.kindForSourceField("groups"), "identity");
  assert.strictEqual(T.kindForSourceField("gsuiteUsers"), "identity");
  assert.strictEqual(T.kindForSourceField("gsuiteOus"), "identity");
  assert.strictEqual(T.kindForSourceField("roaming"), "device");
  assert.strictEqual(T.kindForSourceField("mobileDevices"), "device");
  assert.strictEqual(T.kindForSourceField("chromebooks"), "device");
  assert.strictEqual(T.kindForSourceField("endpointDevices"), "device");
  assert.strictEqual(T.kindForSourceField("networks"), "network");
  assert.strictEqual(T.kindForSourceField("sites"), "network");
  assert.strictEqual(T.kindForSourceField("tunnelGroups"), "network");
  assert.strictEqual(T.kindForSourceField("sourceIpCidr"), "ip");
});

ok("activeSourceKinds folds field keys plus the typed address", () => {
  assert.deepStrictEqual(T.activeSourceKinds(["users"], true).sort(), ["identity", "ip"]);
  assert.deepStrictEqual(T.activeSourceKinds(["networks"], false), ["network"]);
  assert.deepStrictEqual(T.activeSourceKinds([], false), []);
});

console.log("\n=== Group 5: Per-option gate ===");

ok("gate enables a compatible option and reports no reason", () => {
  const gate = T.sourceFieldGate("networks", ["identity"]);
  assert.strictEqual(gate.enabled, true);
  assert.strictEqual(gate.reason, "");
});
ok("gate disables the conflicting location kind and explains why", () => {
  const gate = T.sourceFieldGate("networks", ["ip"]);
  assert.strictEqual(gate.enabled, false);
  assert(/IP \/ CIDR and Networks/.test(gate.reason), gate.reason);
});
ok("gate disables device identity when an IP is typed", () => {
  const gate = T.sourceFieldGate("roaming", ["ip"]);
  assert.strictEqual(gate.enabled, false);
  assert(gate.reason.length > 10);
});
ok("gate keeps the option's own kind enabled", () => {
  const gate = T.sourceFieldGate("users", ["identity"]);
  assert.strictEqual(gate.enabled, true);
});

console.log("\n=== Group 6: Typed destination classification ===");

ok("bare IPv4 and CIDR are IP", () => {
  assert.strictEqual(T.classifyDestinationValue("208.67.222.222"), "ip");
  assert.strictEqual(T.classifyDestinationValue("10.0.0.0/8"), "ip");
});
ok("IPv4 with port is the L4 composite", () => {
  assert.strictEqual(T.classifyDestinationValue("10.0.0.5:443"), "ipport");
  assert.strictEqual(T.classifyDestinationValue("10.0.0.5:443/tcp"), "ipport");
});
ok("domains are FQDN, including a path", () => {
  assert.strictEqual(T.classifyDestinationValue("login.example.com"), "fqdn");
  assert.strictEqual(T.classifyDestinationValue("example.com/admin"), "fqdn");
});
ok("a bare IPv4 is never read as a dotted hostname", () => {
  assert.notStrictEqual(T.classifyDestinationValue("1.2.3.4"), "fqdn");
  assert.notStrictEqual(T.classifyDestinationValue("10.0.0.0/8"), "fqdn");
});
ok("unusable values classify as empty", () => {
  ["", "   ", "!!!", "-"].forEach((v) => {
    assert.strictEqual(T.classifyDestinationValue(v), "", `expected "" for ${JSON.stringify(v)}`);
  });
});
ok("typed source accepts only IP/CIDR", () => {
  assert.strictEqual(T.classifySourceValue("10.0.0.1"), "ip");
  assert.strictEqual(T.classifySourceValue("10.20.0.0/16"), "ip");
  assert.strictEqual(T.classifySourceValue("example.com"), "");
});

console.log("\n=== Group 7: IP + port + protocol composite ===");

ok("splitIpPort splits address, port and protocol", () => {
  assert.deepStrictEqual(T.splitIpPort("10.0.0.5:443/tcp"), { address: "10.0.0.5", port: "443", protocol: "tcp" });
  assert.deepStrictEqual(T.splitIpPort("10.0.0.5:443"), { address: "10.0.0.5", port: "443", protocol: "" });
  assert.deepStrictEqual(T.splitIpPort("[2001:db8::1]:8080/udp"), { address: "2001:db8::1", port: "8080", protocol: "udp" });
});
ok("splitIpPort leaves a plain address untouched", () => {
  assert.deepStrictEqual(T.splitIpPort("10.0.0.5"), { address: "10.0.0.5", port: "", protocol: "" });
});

console.log("\n=== Group 8: Single-destination rule ===");

ok("the taxonomy exposes exactly the four destination kinds plus Any", () => {
  assert.deepStrictEqual(T.DEST_TYPED_KINDS, ["fqdn", "ip", "ipport"]);
  assert.deepStrictEqual(T.DEST_KINDS, ["fqdn", "ip", "ipport", "destList", "any"]);
});
ok("a destination kind accepts its own typed value shape", () => {
  assert.strictEqual(T.destKindAcceptsValue("fqdn", "example.com"), true);
  assert.strictEqual(T.destKindAcceptsValue("ip", "10.0.0.1"), true);
  assert.strictEqual(T.destKindAcceptsValue("ipport", "10.0.0.1:443"), true);
});
ok("the L4 kind also accepts a bare address (port optional)", () => {
  assert.strictEqual(T.destKindAcceptsValue("ipport", "10.0.0.1"), true);
});
ok("a kind rejects a value of another kind", () => {
  assert.strictEqual(T.destKindAcceptsValue("ip", "example.com"), false);
  assert.strictEqual(T.destKindAcceptsValue("fqdn", "10.0.0.1"), false);
});

console.log("\n============================================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log("============================================================");

if (failed > 0) {
  console.log("Some taxonomy tests failed!");
  process.exit(1);
}
console.log("All taxonomy tests passed!");
