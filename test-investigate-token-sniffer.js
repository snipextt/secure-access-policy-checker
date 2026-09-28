#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const messages = [];
  class FakeXHR {
    open() {}
    setRequestHeader() {}
    send() {}
    addEventListener() {}
  }
  const window = {
    location: { origin: "https://dashboard.sse.cisco.com" },
    postMessage(message) { messages.push(message); },
    addEventListener() {},
    fetch: async () => ({ ok: true, status: 200 }),
  };
  const emptyStorage = { length: 0, key() { return null; }, getItem() { return null; } };
  const sandbox = {
    window,
    XMLHttpRequest: FakeXHR,
    sessionStorage: emptyStorage,
    localStorage: emptyStorage,
    atob,
    Date,
    Promise,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("extension/content/token-sniffer.js", "utf8"), sandbox);

  await window.fetch("https://investigate.umbrella.com/domains/categorization/google.com", {
    headers: { Authorization: "Bearer ui-session-token" },
  });
  const captured = messages.find(message => message.type === "TOKEN_CAPTURED");
  assert.ok(captured);
  assert.equal(captured.tokenKey, "mgmt_authz_token");
  assert.equal(captured.token, "ui-session-token");

  console.log("Investigate UI Bearer is relayed as mgmt_authz_token: passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
