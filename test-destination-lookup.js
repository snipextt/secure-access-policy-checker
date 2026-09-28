#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  let requests = 0;
  let tokenChecks = 0;
  let fetches = 0;
  const stored = {};
  const addListener = { addListener() {} };
  const chrome = {
    runtime: { id: "test", onInstalled: addListener, onStartup: addListener, onMessage: addListener },
    storage: {
      local: { async get(key) { return { [key]: stored[key] }; }, async set(values) { Object.assign(stored, values); } },
      session: { async get() { return {}; }, async set() {} },
    },
    tabs: {
      onUpdated: addListener,
      async query() { requests++; return [{ id: 7 }]; },
      async sendMessage(tabId, message) {
        assert.equal(tabId, 7);
        assert.equal(message.tokenKey, "mgmt_authz_token");
        tokenChecks++;
        return { token: "fixture-token", capturedAt: Date.now() };
      },
    },
    alarms: { onAlarm: addListener, create() {}, async get() {} },
    webRequest: { onBeforeSendHeaders: addListener },
    scripting: { async executeScript() {} },
  };
  const sandbox = {
    chrome, console, Date, Map, Set, Promise, URL, setTimeout, clearTimeout,
    importScripts() {}, SecDebugLog: { logEvent() {}, redactToken() { return {}; } },
    async fetch() {
      fetches++;
      return {
        ok: true, status: 200,
        async json() { return { "example.com": { content_categories: [], security_categories: ["1"] } }; },
        async text() { return "null"; },
      };
    },
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("extension/background/service-worker.js", "utf8"), sandbox);
  const result = await vm.runInContext('lookupDestination("example.com")', sandbox);
  assert.equal(result.ok, true);
  assert.ok(requests >= 1);
  assert.equal(tokenChecks, 1);
  assert.equal(fetches, 2);
  console.log("destination lookup recovers a token without a sender tab: passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
