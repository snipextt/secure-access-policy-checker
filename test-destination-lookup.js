#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  let requests = 0;
  let tokenChecks = 0;
  let fetches = 0;
  const fetchCalls = [];
  let webRequestListener;
  let webRequestFilter;
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
    webRequest: {
      onBeforeSendHeaders: {
        addListener(listener, filter) { webRequestListener = listener; webRequestFilter = filter; },
      },
    },
    scripting: { async executeScript() {} },
  };
  const sandbox = {
    chrome, console, Date, Map, Set, Promise, URL, setTimeout, clearTimeout,
    importScripts() {}, SecDebugLog: { logEvent() {}, redactToken() { return {}; } },
    async fetch(url, options) {
      fetches++;
      fetchCalls.push({ url, authorization: options?.headers?.Authorization });
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
  assert.equal(vm.runInContext('tokenKeyForUrl("https://investigate.umbrella.com/domains/categorization/google.com")', sandbox), "mgmt_authz_token");
  assert.ok(webRequestFilter.urls.includes("https://investigate.umbrella.com/*"));
  const result = await vm.runInContext('lookupDestination("example.com")', sandbox);
  assert.equal(result.ok, true);
  assert.ok(requests >= 1);
  assert.equal(tokenChecks, 1);
  assert.equal(fetches, 2);
  assert.ok(fetchCalls[0].url.startsWith("https://investigate.umbrella.com/domains/categorization/example.com"));
  assert.equal(fetchCalls[0].authorization, "Bearer fixture-token");
  webRequestListener({
    url: "https://investigate.umbrella.com/domains/categorization/google.com",
    requestHeaders: [{ name: "Authorization", value: "Bearer ui-token" }],
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(stored.mgmt_authz_token.token, "ui-token");

  vm.runInContext('_scheduleFetch = () => { globalThis.scheduledFetches = (globalThis.scheduledFetches || 0) + 1; }', sandbox);
  const newerCapture = Date.now() + 1000;
  await vm.runInContext(`storeToken("mgmt_authz_token", "duplicate-token", "test", ${newerCapture})`, sandbox);
  await vm.runInContext(`storeToken("mgmt_authz_token", "duplicate-token", "test", ${newerCapture + 1000})`, sandbox);
  assert.equal(stored.mgmt_authz_token.capturedAt, newerCapture);
  assert.equal(vm.runInContext('scheduledFetches', sandbox), 1);
  console.log("Investigate lookup and identical-token recapture behavior: passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
