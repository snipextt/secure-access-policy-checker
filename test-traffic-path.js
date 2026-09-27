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
  sourceTunnelGroups: { 33: "Branch Tunnel" },
};

assert.deepEqual(path.PATHS.client.sources, ["user", "group", "roaming"]);
assert.deepEqual(path.PATHS.va.sources, ["user", "group", "site", "internalIp"]);
assert.deepEqual(path.PATHS.tunnel.sources, ["user", "group", "internalIp", "tunnelGroup"]);
assert.deepEqual(path.stagesForPath("client").map(stage => [stage.key, stage.eventType]), [["dns", "dns"], ["web", "proxy"]]);
assert.deepEqual(path.stagesForPath("va").map(stage => stage.key), ["dns"]);
assert.deepEqual(path.stagesForPath("tunnel").map(stage => stage.key), ["dns", "web"]);
assert.equal(path.stagesForPath("tunnel")[0].basis, "inferred");
assert.equal(path.stageReport("va")[0].key, "dns");
assert.deepEqual(path.buildInput({ path: "va", sourceKind: "site", sourceValue: "21", destination: "example.com" }, catalogs).testInput, {
  sourceSiteId: "21", destination: "example.com", destinationScope: "",
});
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
assert.equal(path.buildInput({ path: "tunnel", sourceKind: "group", sourceValue: "3", destination: "10.0.0.1", scope: "private_network", trafficKind: "web" }, catalogs).testInput.destinationScope, "private_network");
assert.deepEqual(path.buildInput({ path: "client", sourceKind: "user", sourceValue: "7", destination: "10.0.0.1", scope: "private_network" }, catalogs).scenario, {
  trafficKind: "auto", destinationKind: "ip", destinationScope: "private_network", webPort: "", webSteering: "unknown",
});
assert.deepEqual(path.stagesForPath("tunnel", { destinationScope: "private_network" }).map(stage => stage.key), ["private"]);
assert.match(path.buildInput({ path: "va", sourceKind: "site", sourceValue: "21", destination: "10.0.0.1", scope: "private_network" }, catalogs).error, /on-prem VA/);
assert.match(path.buildInput({ path: "client", sourceKind: "user", sourceValue: "7", destination: "10.0.0.1", scope: "public_internet" }, catalogs).error, /Choose Web/);
assert.match(path.buildInput({ path: "va", sourceKind: "site", sourceValue: "21", destination: "https://example.com" }, catalogs).error, /DNS/);
assert.match(path.buildInput({ path: "client", sourceKind: "user", sourceValue: "7", destination: "https://example.com", trafficKind: "dns" }, catalogs).error, /domain/);
assert.deepEqual(path.stagesForPath("client", { trafficKind: "dns", destinationKind: "domain" }).map(stage => stage.key), ["dns"]);
assert.deepEqual(path.stagesForPath("client", { trafficKind: "web", destinationKind: "url" }).map(stage => [stage.key, stage.certainty]), [["dns", "possible"], ["web", "expected"]]);
assert.deepEqual(path.stagesForPath("client", { trafficKind: "web", destinationKind: "ip" }).map(stage => stage.key), ["web"]);
assert.deepEqual(path.stagesForPath("client", { trafficKind: "auto", destinationKind: "url-ip" }).map(stage => stage.key), ["web"]);
assert.deepEqual(path.stagesForPath("va", { trafficKind: "dns", destinationKind: "domain" }).map(stage => stage.key), ["dns"]);
assert.equal(path.normalizeDestination("https://203.0.113.5/docs").destinationKind, "url-ip");
assert.equal(path.normalizeDestination("http://[2001:db8::1]/").error !== undefined, true);
for (const invalid of ["example.com/secret", "10.0.0.1:443", "2001:db8::1", "999.2.3.4", "example.com?query=yes"]) {
  assert.ok(path.normalizeDestination(invalid).error, invalid);
}
assert.deepEqual(path.policyLayer(null), {
  key: "access-policy", label: "Access policy", status: "unresolved", action: "No matching rule", detail: "No access rule matched the loaded rules; this is not an allow or block decision.",
});
assert.deepEqual(path.policyLayer({ noMatch: true, rejected: [] }), path.policyLayer(null));
for (const [raw, action] of [["allow", "Allow"], ["block", "Block"], ["warn", "Warn"], ["isolate", "Isolate"]]) {
  const layer = path.policyLayer({ rule: { action: raw } });
  assert.equal(layer.status, raw);
  assert.equal(layer.action, action);
  assert.match(layer.detail, /matched access rule/);
}
assert.equal(path.policyLayer({ rule: { action: "unexpected" } }).status, "unknown");
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
assert.equal(path.policyLayer(matched).status, "allow");
assert.equal(path.policyLayer(matched).action, "Allow");

const vaRequest = path.buildInput({ path: "va", sourceKind: "site", sourceValue: "21", destination: "example.com" }, catalogs);
const siteRule = {
  ruleId: 15, ruleName: "DNS by site", rulePriority: 15, ruleAction: "block", ruleIsEnabled: true,
  trafficScope: "public_internet", ruleConditions: [
    { attributeName: "umbrella.source.identity_ids", attributeOperator: "INTERSECT", attributeValue: [21] },
    { attributeName: "umbrella.destination.all", attributeOperator: "=", attributeValue: true },
  ],
};
const siteMatch = context.window.Matcher.matchPolicy([siteRule], vaRequest.testInput);
assert.equal(siteMatch.rule.ruleId, 15);
assert.ok(siteMatch.matchedConditions.some(condition => condition.includes("'21' matched")));
const tunnelRequest = path.buildInput({ path: "tunnel", sourceKind: "tunnelGroup", sourceValue: "33", destination: "example.com" }, catalogs);
assert.equal(tunnelRequest.testInput.sourceTunnelGroupId, "33");
const tunnelRule = { ...siteRule, ruleId: 16, ruleName: "Tunnel access", rulePriority: 16, ruleConditions: [
  { attributeName: "umbrella.source.identity_ids", attributeOperator: "INTERSECT", attributeValue: [33] },
  { attributeName: "umbrella.destination.all", attributeOperator: "=", attributeValue: true },
] };
assert.equal(context.window.Matcher.matchPolicy([tunnelRule], tunnelRequest.testInput).rule.ruleId, 16);
assert.equal(context.window.Matcher.matchPolicy([rule, { ...rule, ruleId: 17, rulePriority: 17, ruleAction: "block" }], request.testInput, { sourceIdentityTypeIds: { 7: 7 } }).rule.ruleId, 14);
assert.deepEqual(path.stageReport("va").map(stage => stage.key), ["dns"]);
assert.deepEqual(path.stageReport("client").map(stage => stage.key), ["dns", "web"]);
assert.deepEqual(path.stageReport("tunnel").map(stage => stage.key), ["dns", "web"]);
assert.deepEqual(path.stageReport("client", { destinationScope: "private_network" }).map(stage => stage.key), ["private"]);

const shared = path.evaluateStages("client", request, input => context.window.Matcher.matchPolicy([rule], input, { sourceIdentityTypeIds: { 7: 7 } }));
assert.deepEqual(shared.map(item => item.state), ["matched", "matched"]);
assert.equal(shared[0].match.rule.ruleId, shared[1].match.rule.ruleId);
assert.deepEqual(shared.map(item => item.match.matchedConditions.length), [2, 2]);
const blockedStages = path.evaluateStages("client", request, input => context.window.Matcher.matchPolicy([{ ...rule, ruleAction: "block" }], input, { sourceIdentityTypeIds: { 7: 7 } }));
assert.deepEqual(blockedStages.map(item => item.state), ["matched", "not-reached"]);
const unrouted = path.evaluateStages("client", { ...request, scenario: { ...request.scenario, webSteering: "no" } }, input => context.window.Matcher.matchPolicy([rule], input, { sourceIdentityTypeIds: { 7: 7 } }));
assert.deepEqual(unrouted.map(item => item.state), ["matched", "not-routed"]);
const vaStages = path.evaluateStages("va", vaRequest, input => context.window.Matcher.matchPolicy([siteRule], input));
assert.deepEqual(vaStages.map(item => item.stage.key), ["dns"]);
assert.equal(path.webProfile({ raw: { ruleSettings: [{ settingName: "umbrella.posture.webProfileId", settingValue: 27 }] } }), "27");
assert.equal(path.webProfile(rule), null);
assert.equal(path.buildInput({ path: "client", sourceKind: "user", sourceValue: "7", destination: "https://example.com/path" }, catalogs).scenario.webPort, "443");
const portRequest = path.buildInput({ path: "client", sourceKind: "user", sourceValue: "7", destination: "http://example.com:8080/path" }, catalogs);
assert.equal(portRequest.scenario.webPort, "8080");
assert.equal(path.stageInput(portRequest.testInput, portRequest.scenario, "web").destinationPort, "8080");
assert.equal(path.stageInput(portRequest.testInput, portRequest.scenario, "dns").destinationPort, undefined);
assert.deepEqual(path.evaluateStages("client", portRequest, () => ({ rule })).map(item => item.state), ["matched", "needs-routing"]);
const portRule = {
  ...rule, ruleId: 18, rulePriority: 1, ruleConditions: [rule.ruleConditions[0],
    { attributeName: "umbrella.destination.composite_inline_ip", attributeOperator: "IN", attributeValue: [{ ip: ["example.com"], port: ["443"], protocol: "TCP" }] }],
};
const portRules = input => context.window.Matcher.matchPolicy([portRule, rule], input, { sourceIdentityTypeIds: { 7: 7 } });
assert.equal(portRules(path.stageInput(request.testInput, request.scenario, "dns")).indeterminate, true);
assert.equal(portRules(path.stageInput(request.testInput, request.scenario, "web")).rule.ruleId, 18);
const classifiedRule = {
  ...rule, ruleId: 19, rulePriority: 1, ruleConditions: [
    ...rule.ruleConditions.slice(0, 1),
    { attributeName: "umbrella.destination.category_ids", attributeOperator: "INTERSECT", attributeValue: [27] },
  ],
};
const guard = input => context.window.Matcher.matchPolicy([classifiedRule, rule], input, { sourceIdentityTypeIds: { 7: 7 } });
assert.equal(guard(path.stageInput(request.testInput, request.scenario, "dns")).indeterminate, true);
assert.deepEqual(path.evaluateStages("client", request, guard).map(item => item.state), ["needs-context", "needs-context"]);
assert.equal(path.evaluateStages("client", request, guard)[1].dnsUnresolved, true);
assert.equal(guard(request.testInput).rule.ruleId, 14);
const mismatchedSource = { ...classifiedRule, ruleId: 20, ruleConditions: [
  { attributeName: "umbrella.source.identity_ids", attributeOperator: "INTERSECT", attributeValue: [999] },
  classifiedRule.ruleConditions[1],
] };
assert.equal(context.window.Matcher.matchPolicy([mismatchedSource, rule], path.stageInput(request.testInput, request.scenario, "dns"), { sourceIdentityTypeIds: { 7: 7 } }).rule.ruleId, 14);

console.log("traffic path model and matcher integration: assertions passed");
