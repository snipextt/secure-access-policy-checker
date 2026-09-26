#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
global.TesterTaxonomy = require("./extension/popup/tester-taxonomy.js");
const path = require("./extension/popup/traffic-path.js");
const catalogs = {
  sourceUsers: { 7: "Carol Freeman" },
  sourceGroups: { 3: "HR" },
  sourceRoaming: { 9: "DAPQA-CSE-13" },
  sourceSites: { 21: "Default Site" },
};

assert.deepEqual(path.PATHS.client.sources, ["user", "group", "roaming"]);
assert.deepEqual(path.PATHS.va.layers, ["dns"]);
assert.deepEqual(path.PATHS.tunnel.sources, ["user", "group", "internalIp"]);
assert.match(path.buildInput({ path: "client", sourceKind: "site", sourceValue: "21", destination: "example.com" }, catalogs).error, /supported/);
assert.match(path.buildInput({ path: "client", sourceKind: "internalIp", sourceValue: "10.0.0.1", destination: "example.com" }, catalogs).error, /supported/);
assert.match(path.buildInput({ path: "client", sourceKind: "user", sourceValue: "999", destination: "example.com" }, catalogs).error, /loaded catalog/);
assert.deepEqual(path.buildInput({ path: "client", sourceKind: "roaming", sourceValue: "9", destination: "https://example.com/a?b=1" }, catalogs).testInput, {
  sourceRoamingId: "9", destination: "example.com", destinationScope: "",
});
assert.match(path.normalizeDestination("https://example.com/a").note, /host/);
assert.equal(path.buildInput({ path: "va", sourceKind: "internalIp", sourceValue: "10.0.0.1/32", destination: "example.com" }, catalogs).testInput.source, "10.0.0.1");
assert.match(path.buildInput({ path: "va", sourceKind: "internalIp", sourceValue: "10.0.0.1/24", destination: "example.com" }, catalogs).error, /multiple clients/);
assert.match(path.buildInput({ path: "client", sourceKind: "user", sourceValue: "7", destination: "10.0.0.0/24", scope: "public_internet" }, catalogs).error, /multiple hosts/);
assert.match(path.buildInput({ path: "va", sourceKind: "internalIp", sourceValue: "999.0.0.1", destination: "example.com" }, catalogs).error, /IPv4/);
assert.match(path.buildInput({ path: "tunnel", sourceKind: "group", sourceValue: "3", destination: "10.0.0.1" }, catalogs).error, /scope/);
assert.equal(path.buildInput({ path: "tunnel", sourceKind: "group", sourceValue: "3", destination: "10.0.0.1", scope: "private_network" }, catalogs).testInput.destinationScope, "private_network");
for (const invalid of ["example.com/secret", "10.0.0.1:443", "2001:db8::1", "999.2.3.4", "example.com?query=yes"]) {
  assert.ok(path.normalizeDestination(invalid).error, invalid);
}
assert.deepEqual(path.layerSummary("va", null).map(layer => layer.status), ["not-evaluated", "not-applicable", "not-applicable", "not-applicable"]);
assert.deepEqual(path.layerSummary("client", { rule: { security_profiles: { tls_decryption_enabled: true, dlp_enabled: true } } }).map(layer => layer.status), ["not-evaluated", "not-evaluated", "not-evaluated", "not-evaluated"]);
assert.match(path.layerSummary("client", { rule: { security_profiles: { tls_decryption_enabled: true } } })[2].detail, /configured/);
const vm = require("node:vm");
const fs = require("node:fs");
const context = vm.createContext({ window: {}, console, Array, String, Object, JSON, Math, Set, RegExp, parseInt, isNaN });
vm.runInContext(fs.readFileSync("extension/popup/matcher.js", "utf8"), context);
const request = path.buildInput({ path: "client", sourceKind: "user", sourceValue: "7", destination: "https://example.com/path" }, catalogs);
const rule = {
  ruleId: 14, ruleName: "Allow selected user", rulePriority: 14, ruleAction: "allow", ruleIsEnabled: true,
  trafficScope: "public_internet", ruleConditions: [
    { attributeName: "umbrella.source.identity_ids", attributeOperator: "INTERSECT", attributeValue: [7] },
    { attributeName: "umbrella.destination.all", attributeOperator: "=", attributeValue: true },
  ],
};
const matched = context.window.Matcher.matchPolicy([rule], request.testInput, { sourceIdentityTypeIds: { 7: 7 } });
assert.equal(matched.rule.ruleId, 14);
assert.equal(path.layerSummary("client", matched)[0].status, "not-evaluated");

console.log("traffic path model and matcher integration: assertions passed");
