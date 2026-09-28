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
    fetch: async () => ({
      ok: true,
      status: 200,
      clone() {
        return { async text() { return JSON.stringify({ access_token: "minted-investigate-token" }); } };
      },
    }),
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
  const uiToken = messages.find(message => message.type === "TOKEN_CAPTURED");
  assert.ok(uiToken);
  assert.equal(uiToken.tokenKey, "mgmt_authz_token");
  assert.equal(uiToken.token, "ui-session-token");

  await window.fetch("https://management.api.umbrella.com/auth/v2/oauth2/jwt-bearer/token", {
    method: "POST",
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer",
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  const mintedToken = messages.find(message => message.token === "minted-investigate-token");
  assert.ok(mintedToken, "captures access_token from the dashboard oauth2 JWT-bearer exchange");
  assert.equal(mintedToken.tokenKey, "mgmt_authz_token");

  console.log("Dashboard oauth2 JWT-bearer response is relayed as mgmt_authz_token: passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
