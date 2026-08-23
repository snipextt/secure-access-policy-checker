#!/usr/bin/env node
// =============================================================================
// test-membership.js — Exercises the group/list membership recursion logic
// that powers the dashboard popover's recursive source/destination expand
// (service-worker.js: collectGroupIds / MEMBERSHIP_CONFIG / _classifyMember /
// parseMembership / _extractMemberList).
//
// These are PURE functions; we pull them out of service-worker.js via a vm
// sandbox (no chrome.* / browser needed) so the recursion + nested-group
// detection stay covered without a live Cisco API.
//
// Run: node test-membership.js
// =============================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const swSrc = fs.readFileSync(
  path.join(__dirname, "extension/background/service-worker.js"),
  "utf-8"
);

// service-worker.js touches chrome.* / importScripts at top level (token
// storage, listeners). Stub those minimally so the file can be loaded in a
// vm; the pure membership helpers under test (collectGroupIds / parseMembership
// / etc.) don't call any of them.
const listener = () => {};
const chromeStub = {
  runtime: { id: "test", onInstalled: { addListener: listener }, onStartup: { addListener: listener }, onMessage: { addListener: listener } },
  storage: { session: { get: () => Promise.resolve({}), set: () => Promise.resolve() }, local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
  tabs: { onUpdated: { addListener: listener }, query: () => Promise.resolve([]) },
  alarms: { onAlarm: { addListener: listener }, create: () => {}, get: () => Promise.resolve(undefined) },
  webRequest: { onBeforeSendHeaders: { addListener: listener } },
  scripting: { executeScript: () => Promise.resolve() },
};
const sandbox = { console, chrome: chromeStub, importScripts: () => {}, SecDebugLog: { logEvent() {}, redactToken: () => ({ length: 0, prefix: "" }) } };
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

// Extract just the membership-related pure helpers (no fetch / chrome API use
// inside them — collectGroupIds, MEMBERSHIP_CONFIG, _classifyMember,
// _extractMemberList, parseMembership). We grab them by injecting a named
// export shim at the end of the source.
const exportShim = `
global.__membership = {
  collectGroupIds,
  MEMBERSHIP_CONFIG,
  _classifyMember,
  _extractMemberList,
  parseMembership,
};
`;
// The helpers are declared with `function`/`const` at top level, so they're
// reachable in the sandbox global after running the file.
vm.runInContext(swSrc + exportShim, sandbox);
const M = sandbox.__membership;

let passed = 0, failed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (cond) passed++;
  else { failed++; console.error(`  FAIL: ${msg}`); }
}
function eq(a, b, msg) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== Group 1: collectGroupIds (rule condition → group IDs) ===");
{
  const rules = [
    { conditions: [
      { attributeName: "umbrella.source.networkObjectGroupIds", attributeValue: [10, 11] },
      { attributeName: "umbrella.destination.serviceObjectGroupIds", attributeValue: [20] },
    ]},
    { conditions: [
      { attributeName: "umbrella.destination.destination_list_ids", attributeValue: ["99"] },
      { attributeName: "umbrella.destination.application_list_ids", attributeValue: [300] },
      { attributeName: "umbrella.destination.category_list_ids", attributeValue: [400] },
      { attributeName: "umbrella.destination.private_resource_group_ids", attributeValue: [500] },
      // non-group condition must NOT be collected
      { attributeName: "umbrella.source.identity_ids", attributeValue: [7] },
      { attributeName: "umbrella.destination.application_ids", attributeValue: [123] },
    ]},
  ];
  const ids = M.collectGroupIds(rules);
  eq(ids.networkObjectGroups, ["10", "11"], "networkObjectGroups");
  eq(ids.serviceObjectGroups, ["20"], "serviceObjectGroups");
  eq(ids.destinationLists, ["99"], "destinationLists");
  eq(ids.applicationLists, ["300"], "applicationLists");
  eq(ids.categoryLists, ["400"], "categoryLists");
  eq(ids.privateResourceGroups, ["500"], "privateResourceGroups");
  assert(ids.identityGroups === undefined, "no identityGroups key (removed)");
}

// ---------------------------------------------------------------------------
console.log("\n=== Group 2: _classifyMember (leaf vs nested-group) ===");
{
  // Nested group detection: a member carrying its own children array.
  eq(M._classifyMember({ id: 5, children: [{ id: 6 }] }, "networkObjectGroups"),
     { id: "5", kind: "networkObjectGroups" }, "member with children → its own group kind");
  // Nested group detection: typed as a group.
  eq(M._classifyMember({ id: 5, type: "NetworkObjectGroup" }, "networkObjectGroups"),
     { id: "5", kind: "networkObjectGroups" }, "member typed group → group kind");
  // Plain leaf object.
  eq(M._classifyMember({ id: 8, name: "Obj8" }, "networkObjectGroups"),
     { id: "8", kind: "networkObject" }, "plain leaf → leafKind");
  // Numeric id → string.
  eq(M._classifyMember(42, "serviceObjectGroups"), { id: "42", kind: "serviceObject" }, "numeric id → leafKind");
  // Null / unresolvable → null.
  assert(M._classifyMember(null, "networkObjectGroups") === null, "null member → null");
  assert(M._classifyMember({}, "networkObjectGroups") === null, "member with no id → null");
}

// ---------------------------------------------------------------------------
console.log("\n=== Group 3: _extractMemberList (candidate member-field names) ===");
{
  const items = [
    { objects: [101, 102] },          // networkObjectGroups candidate field
    { members: [{ id: 7 }] },          // NOT a networkObjectGroups candidate → ignored
    { resourceIds: [5001] },           // privateResourceGroups candidate field
    {},                                // no members
  ];
  eq(M._extractMemberList(items[0], "networkObjectGroups").map(m => m.id), ["101", "102"], "objects field");
  eq(M._extractMemberList(items[1], "networkObjectGroups"), [], "non-candidate field (members) ignored");
  eq(M._extractMemberList(items[2], "privateResourceGroups").map(m => m.id), ["5001"], "resourceIds field");
  eq(M._extractMemberList(items[3], "networkObjectGroups"), [], "no members → []");
}

// ---------------------------------------------------------------------------
console.log("\n=== Group 4: parseMembership (shape + recursive nesting) ===");
{
  // A network object group whose members include a leaf object AND another
  // nested group (which the popover would drill into).
  const json = {
    data: [
      { id: "G1", name: "Top Group",
        objects: [
          { id: 100, name: "Leaf Obj" },
          { id: "G2", name: "Nested Group", children: [{ id: 201 }] },
        ] },
    ],
  };
  const parsed = M.parseMembership(json, "networkObjectGroups");
  eq(parsed.length, 1, "one group parsed");
  eq(parsed[0].id, "G1", "group id");
  eq(parsed[0].name, "Top Group", "group name");
  // members: leaf + nested group
  eq(parsed[0].members.map(m => m.id), ["100", "G2"], "members include nested group id");
  const nested = parsed[0].members.find(m => m.id === "G2");
  assert(nested.kind === "networkObjectGroups", "nested member keeps group kind → recursive expand");
  const leaf = parsed[0].members.find(m => m.id === "100");
  assert(leaf.kind === "networkObject", "leaf member is leaf kind (not expandable)");
}

// ---------------------------------------------------------------------------
console.log("\n=== Group 5: parseMembership — destination list FQDN strings ===");
{
  const json = { data: [ { id: 99, name: "My List", destinations: ["example.com", "10.0.0.0/8"] } ] };
  const parsed = M.parseMembership(json, "destinationLists");
  eq(parsed[0].members.map(m => m.value).sort(), ["10.0.0.0/8", "example.com"], "FQDN/string members");
  assert(parsed[0].members.every(m => m.kind === "fqdn"), "destination list members are fqdn leaves");
}

// ---------------------------------------------------------------------------
console.log("\n=== Group 6: parseMembership — unknown wrapper degrades to [] ===");
{
  eq(M.parseMembership({}, "networkObjectGroups"), [], "empty object → no items → []");
  eq(M.parseMembership({ unrelated: [] }, "networkObjectGroups"), [], "non-wrapper key → []");
}

// ---------------------------------------------------------------------------
console.log("\n=== Group 7: MEMBERSHIP_CONFIG keys are expandable kinds ===");
{
  const keys = Object.keys(M.MEMBERSHIP_CONFIG);
  eq(keys.sort(),
     ["applicationLists", "categoryLists", "destinationLists", "networkObjectGroups", "privateResourceGroups", "serviceObjectGroups"].sort(),
     "configured group/list kinds (no identityGroups)");
  for (const k of keys) {
    assert(M.MEMBERSHIP_CONFIG[k] && M.MEMBERSHIP_CONFIG[k].tokenKey, `config ${k} has tokenKey`);
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(60)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${total} total`);
console.log(`${"=".repeat(60)}`);

if (failed > 0) { process.exit(1); } else { console.log("All membership tests passed!"); process.exit(0); }
