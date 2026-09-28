#!/usr/bin/env node
"use strict";
// Policy Checker model (extension/popup/traffic-path.js) driven through the
// real matcher. Run: node test-traffic-path.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const ip = require("./extension/popup/ip-address.js");
globalThis.IPAddress = ip;
const model = require("./extension/popup/traffic-path.js");
const context = vm.createContext({ window: { IPAddress: ip }, console, Array, String, Object, JSON, Math, Set, Map, RegExp, parseInt, isNaN, Number });
vm.runInContext(fs.readFileSync("extension/popup/matcher.js", "utf8"), context);
const Matcher = context.window.Matcher;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (error) { console.error(`FAIL ${name}`); throw error; }
}

const catalogs = {
  sourceUsers: { 7: "Carol Freeman", 8: "Dan Ruiz" },
  sourceGroups: { 3: "HR", 4: "All staff" },
  sourceRoaming: { 9: "DAPQA-CSE-13" },
  sourceSites: { 21: "Default Site" },
  sourceNetworks: { 1: "London 1" },
  sourceTunnelGroups: { 33: "Branch Tunnel" },
  contentCategories: { 27: "Gambling", 28: "Social Networking" },
  sourceIdentityTypeIds: { 7: 7, 8: 7, 3: 3, 4: 3, 9: 9, 21: 21, 1: 1, 33: 40 },
};
const memberMaps = {
  identityGroups: {
    3: { name: "HR", members: [{ id: "7", kind: "identity", name: "Carol Freeman" }], resolved: true },
    4: { name: "All staff", members: [{ id: "3", kind: "identityGroups", name: "HR" }], resolved: true },
  },
  privateResources: {
    8627: { name: "HR app", members: [{ value: "hr.internal.example", kind: "address" }, { value: "10.20.0.0/16", kind: "address" }], resolved: true },
  },
  privateResourceGroups: {},
};
const lookups = { ...catalogs, memberMaps };

const cond = (attributeName, attributeOperator, attributeValue) => ({ attributeName, attributeOperator, attributeValue });
const SRC_ALL = cond("umbrella.source.all", "=", true);
const DST_ALL = cond("umbrella.destination.all", "=", true);
let nextId = 1;
function rule(name, action, conditions, extra = {}) {
  const id = nextId++;
  return { ruleId: id, ruleName: name, rulePriority: id, ruleAction: action, ruleIsEnabled: true, trafficScope: "public_internet", ruleConditions: conditions, ...extra };
}
const internetDefault = rule("Default Internet", "allow", [SRC_ALL, DST_ALL], { ruleIsDefault: true, rulePriority: 999 });
const privateDefault = rule("Default Private", "block", [SRC_ALL, DST_ALL], { ruleIsDefault: true, rulePriority: 998, trafficScope: "private_network" });

function build(form) {
  const built = model.buildRequest(form, catalogs);
  assert.ok(!built.error, built.error);
  return built.request;
}
function run(form, rules) {
  return model.evaluate(build(form), [...rules, internetDefault, privateDefault], lookups, Matcher);
}
const states = evaluation => evaluation.stages.map(result => `${result.stage.key}:${result.state}${result.match && result.match.rule && result.state === "matched" ? `:${result.match.rule.ruleName}` : ""}`);

// --- Destination parsing ----------------------------------------------------
test("destination parsing", () => {
  assert.deepEqual(model.parseDestination("Example.com."), { host: "example.com", kind: "domain", port: "" });
  assert.deepEqual(model.parseDestination("https://example.com/login?x=1"), { host: "example.com", kind: "domain", port: "443", fromUrl: true });
  assert.equal(model.parseDestination("http://example.com:8080/").port, "8080");
  assert.deepEqual(model.parseDestination("203.0.113.10:445"), { host: "203.0.113.10", kind: "ip", port: "445" });
  assert.deepEqual(model.parseDestination("[2001:db8::1]:443"), { host: "2001:db8::1", kind: "ip", port: "443" });
  assert.equal(model.parseDestination("2001:db8::1").kind, "ip");
  for (const bad of ["", "10.0.0.0/8", "*.example.com", "ftp://example.com", "exa mple.com", "10.0.0.1:99999", "example"]) {
    assert.ok(model.parseDestination(bad).error, bad);
  }
});

// --- Sources per connection ------------------------------------------------
test("connection limits sources", () => {
  assert.deepEqual(model.CONNECTIONS.client.sources, ["roaming", "identity"]);
  assert.deepEqual(model.CONNECTIONS.va.sources, ["site", "internalIp", "identity", "network"]);
  assert.deepEqual(model.CONNECTIONS.tunnel.sources, ["tunnel", "internalIp", "identity"]);
  // A site picked earlier is ignored once the connection is Secure Client.
  const request = build({ connection: "client", sources: { roaming: "sourceRoaming:9", site: "sourceSites:21" }, destination: "example.com" });
  assert.deepEqual(request.testInput, { sourceRoamingId: "9" });
  assert.match(model.buildRequest({ connection: "client", sources: { site: "sourceSites:21" }, destination: "example.com" }, catalogs).error, /at least one source/);
  assert.match(model.buildRequest({ connection: "", sources: {}, destination: "example.com" }, catalogs).error, /connects/);
});

test("source validation", () => {
  const va = build({ connection: "va", sources: { site: "sourceSites:21", internalIp: "10.1.2.3", identity: "sourceUsers:7", network: "sourceNetworks:1" }, destination: "example.com" });
  assert.deepEqual(va.testInput, { sourceSiteId: "21", source: "10.1.2.3", sourceUserId: "7", sourceNetworkId: "1" });
  assert.equal(va.identities.length, 4);
  assert.match(model.buildRequest({ connection: "va", sources: { internalIp: "10.1.2.0/24" }, destination: "example.com" }, catalogs).error, /not a range/);
  assert.match(model.buildRequest({ connection: "va", sources: { internalIp: "10.1.2.300" }, destination: "example.com" }, catalogs).error, /not a valid/);
  assert.match(model.buildRequest({ connection: "client", sources: { identity: "sourceUsers:999" }, destination: "example.com" }, catalogs).error, /no longer in the loaded catalog/);
  assert.match(model.buildRequest({ connection: "client", sources: { roaming: "sourceUsers:7" }, destination: "example.com" }, catalogs).error, /from the list/);
  assert.match(model.buildRequest({ connection: "va", sources: { site: "sourceSites:21" }, destination: "203.0.113.10" }, catalogs).error, /only sees DNS/);
});

// --- Stage plan ------------------------------------------------------------
test("stage plan per connection", () => {
  const plan = form => {
    const request = build(form);
    const scope = model.resolveScope(request.destination.host, lookups);
    const result = model.planStages(request, scope);
    return result.error && !result.stages.length ? `error:${result.error}` : result.stages.map(stage => stage.key).join(",") + (result.skipped && result.skipped.length ? ` skip:${result.skipped.map(stage => stage.key)}` : "");
  };
  const client = { connection: "client", sources: { roaming: "sourceRoaming:9" } };
  const tunnel = { connection: "tunnel", sources: { tunnel: "sourceTunnelGroups:33" } };
  assert.equal(plan({ ...client, destination: "example.com" }), "dns,web");
  assert.equal(plan({ ...client, destination: "https://example.com/x" }), "dns,web");
  assert.equal(plan({ ...client, destination: "203.0.113.10" }), "web");
  assert.match(plan({ ...client, destination: "203.0.113.10", port: "22" }), /^error:/);
  assert.equal(plan({ connection: "va", sources: { site: "sourceSites:21" }, destination: "example.com" }), "dns");
  assert.equal(plan({ ...tunnel, destination: "example.com" }), "dns,web skip:firewall");
  assert.equal(plan({ ...tunnel, destination: "203.0.113.10", port: "445" }), "firewall");
  assert.equal(plan({ ...tunnel, destination: "203.0.113.10" }), "firewall,web");
  assert.equal(plan({ ...tunnel, destination: "203.0.113.10", protocol: "ICMP" }), "firewall");
  assert.equal(plan({ ...tunnel, destination: "hr.internal.example" }), "private");
  assert.equal(plan({ ...tunnel, destination: "10.9.9.9" }), "private");
  assert.match(plan({ connection: "va", sources: { site: "sourceSites:21" }, destination: "hr.internal.example" }), /error:Private Access is not reached/);
});

// --- Evaluation ------------------------------------------------------------
test("user matches a rule on a nested group", () => {
  const staff = rule("Block gambling for staff", "block", [cond("umbrella.source.identity_ids", "INTERSECT", [4]), DST_ALL]);
  const evaluation = run({ connection: "client", sources: { roaming: "sourceRoaming:9", identity: "sourceUsers:7" }, destination: "example.com" }, [staff]);
  assert.deepEqual(evaluation.groups.map(group => group.name).sort(), ["All staff", "HR"]);
  assert.deepEqual(states(evaluation), ["dns:matched:Block gambling for staff", "web:not-reached"]);
  assert.equal(evaluation.outcome.status, "block");
  assert.equal(evaluation.outcome.title, "Blocked at DNS");
  // Dan is not in HR, so the default applies at both stages.
  const other = run({ connection: "client", sources: { identity: "sourceUsers:8" }, destination: "example.com" }, [staff]);
  assert.deepEqual(states(other), ["dns:matched:Default Internet", "web:matched:Default Internet"]);
  assert.equal(other.outcome.status, "allow");
});

test("roaming computer identity type rule", () => {
  const roamingRule = rule("All roaming computers", "warn", [cond("umbrella.source.identity_type_ids", "INTERSECT", [9]), DST_ALL]);
  const evaluation = model.evaluate(build({ connection: "client", sources: { roaming: "sourceRoaming:9" }, destination: "example.com" }), [roamingRule, internetDefault], { ...lookups, sourceIdentityTypeIds: catalogs.sourceIdentityTypeIds }, Matcher);
  assert.deepEqual(states(evaluation), ["dns:matched:All roaming computers", "web:matched:All roaming computers"]);
  assert.equal(evaluation.outcome.status, "warn");
});

test("category rule asks, then resolves from the answer", () => {
  const gambling = rule("Block gambling", "block", [SRC_ALL, cond("umbrella.destination.category_ids", "INTERSECT", [27, 28])]);
  const form = { connection: "client", sources: { roaming: "sourceRoaming:9" }, destination: "bet.example" };
  const first = run(form, [gambling]);
  assert.deepEqual(states(first), ["dns:needs-answer", "web:needs-answer"]);
  assert.equal(first.outcome.status, "pending");
  const question = model.questionFor(first.stages[0], "bet.example", lookups);
  assert.equal(question.ruleName, "Block gambling");
  assert.deepEqual(question.groups[0].options.map(option => option.label), ["Gambling", "Social Networking"]);

  const yes = run({ ...form, facts: model.answer({}, question, ["27"]) }, [gambling]);
  assert.deepEqual(states(yes), ["dns:matched:Block gambling", "web:not-reached"]);

  const no = run({ ...form, facts: model.answer({}, question, []) }, [gambling]);
  assert.deepEqual(states(no), ["dns:matched:Default Internet", "web:matched:Default Internet"]);
});

test("DNS and Web can land on different rules", () => {
  const webOnly = rule("Block uploads over web", "block", [SRC_ALL, cond("umbrella.destination.composite_inline_ip", "IN", [{ ip: ["example.com"], port: ["443"], protocol: "TCP" }])]);
  const evaluation = run({ connection: "client", sources: { roaming: "sourceRoaming:9" }, destination: "https://example.com/upload" }, [webOnly]);
  // The lookup itself goes to UDP 53, so the HTTPS-only rule applies at Web.
  assert.deepEqual(states(evaluation), ["dns:matched:Default Internet", "web:matched:Block uploads over web"]);
  assert.equal(evaluation.outcome.title, "Blocked at Web");
});

test("tunnel firewall: port rules match, content categories do not apply", () => {
  const rpc = rule("Block RPC", "block", [SRC_ALL, cond("umbrella.destination.composite_inline_ip", "IN", [{ ip: ["0.0.0.0/0"], port: ["135"], protocol: "TCP" }])]);
  const social = rule("Block social", "block", [SRC_ALL, cond("umbrella.destination.category_ids", "INTERSECT", [28])]);
  const tunnel = { connection: "tunnel", sources: { tunnel: "sourceTunnelGroups:33", internalIp: "10.1.2.3" } };
  assert.deepEqual(states(run({ ...tunnel, destination: "203.0.113.10", port: "135" }, [rpc, social])), ["firewall:matched:Block RPC"]);
  const web = run({ ...tunnel, destination: "203.0.113.10" }, [rpc, social]);
  assert.deepEqual(states(web), ["firewall:matched:Default Internet", "web:needs-answer"]);
});

test("firewall block stops web", () => {
  const blockIp = rule("Block bad IP", "block", [SRC_ALL, cond("umbrella.destination.composite_inline_ip", "IN", [{ ip: ["203.0.113.0/24"], port: ["0-65535"], protocol: "ANY" }])]);
  const evaluation = run({ connection: "tunnel", sources: { tunnel: "sourceTunnelGroups:33" }, destination: "203.0.113.10" }, [blockIp]);
  assert.deepEqual(states(evaluation), ["firewall:matched:Block bad IP", "web:not-reached"]);
  assert.equal(evaluation.outcome.title, "Blocked at Firewall");
});

test("private resource destination", () => {
  const hrApp = rule("HR app for HR", "allow", [cond("umbrella.source.identity_ids", "INTERSECT", [3]), cond("umbrella.destination.private_resource_ids", "IN", [8627])], { trafficScope: "private_network" });
  const hr = run({ connection: "client", sources: { identity: "sourceUsers:7" }, destination: "hr.internal.example" }, [hrApp]);
  assert.deepEqual(hr.scope.resourceNames, ["HR app"]);
  assert.deepEqual(states(hr), ["private:matched:HR app for HR"]);
  const byIp = run({ connection: "tunnel", sources: { identity: "sourceUsers:7" }, destination: "10.20.1.5", port: "443" }, [hrApp]);
  assert.deepEqual(states(byIp), ["private:matched:HR app for HR"]);
  const outsider = run({ connection: "client", sources: { identity: "sourceUsers:8" }, destination: "hr.internal.example" }, [hrApp]);
  assert.deepEqual(states(outsider), ["private:matched:Default Private"]);
});

test("VA site and internal IP", () => {
  const siteRule = rule("Branch DNS filtering", "block", [cond("umbrella.source.identity_ids", "INTERSECT", [21]), DST_ALL]);
  const ipRule = rule("Lab subnet", "allow", [cond("umbrella.source.composite_inline_ip", "IN", [{ ip: ["10.50.0.0/16"], port: ["any"], protocol: "ANY" }]), DST_ALL]);
  assert.deepEqual(states(run({ connection: "va", sources: { internalIp: "10.50.3.4" }, destination: "example.com" }, [ipRule, siteRule])), ["dns:matched:Lab subnet"]);
  assert.deepEqual(states(run({ connection: "va", sources: { site: "sourceSites:21", internalIp: "10.60.3.4" }, destination: "example.com" }, [ipRule, siteRule])), ["dns:matched:Branch DNS filtering"]);
});

test("disabled rules are skipped", () => {
  const off = rule("Disabled block", "block", [SRC_ALL, DST_ALL], { ruleIsEnabled: false });
  assert.deepEqual(states(run({ connection: "va", sources: { site: "sourceSites:21" }, destination: "example.com" }, [off])), ["dns:matched:Default Internet"]);
});

console.log(`traffic path checker: ${passed} tests passed`);
