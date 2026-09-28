// =============================================================================
// traffic-path.js — Policy Checker model.
//
// Predicts which access rule a request hits at each enforcement point, the
// way Umbrella's policy tester does, from three connection types:
//
//   Secure Client   roaming computer (+ logged-in user)     DNS → Web
//   On-prem VA      site, internal IP, AD user, egress net   DNS only
//   S2S tunnel      network tunnel, internal IP, user        DNS → Firewall → Web
//
// A request carries every identity its connection exposes; a rule's source
// matches if any of them (or a group they belong to) is listed. Stages run in
// traffic order and a block stops the later stages.
//
// Pure logic (no DOM, no extension APIs) so Node tests can drive it.
// =============================================================================
(function (root) {
  "use strict";

  const ip = root.IPAddress;

  const SOURCES = {
    roaming: { label: "Roaming computer", catalogs: ["sourceRoaming"], inputKey: "sourceRoamingId", placeholder: "Search roaming computers" },
    identity: { label: "User or group", catalogs: ["sourceUsers", "sourceGroups"], placeholder: "Search users and groups" },
    site: { label: "Site", catalogs: ["sourceSites"], inputKey: "sourceSiteId", placeholder: "Search sites" },
    network: { label: "Egress network (public IP)", catalogs: ["sourceNetworks"], inputKey: "sourceNetworkId", placeholder: "Search networks" },
    tunnel: { label: "Network tunnel", catalogs: ["sourceTunnelGroups"], inputKey: "sourceTunnelGroupId", placeholder: "Search network tunnels" },
    internalIp: { label: "Internal client IP", placeholder: "e.g. 10.1.20.15" },
  };

  const CATALOG_INPUT_KEY = {
    sourceUsers: "sourceUserId",
    sourceGroups: "sourceGroupId",
    sourceRoaming: "sourceRoamingId",
    sourceSites: "sourceSiteId",
    sourceNetworks: "sourceNetworkId",
    sourceTunnelGroups: "sourceTunnelGroupId",
  };

  const CONNECTIONS = {
    client: {
      label: "Secure Client", layers: "DNS + Web",
      description: "A roaming computer with Secure Client. Traffic carries the computer and the signed-in user.",
      sources: ["roaming", "identity"],
    },
    va: {
      label: "On-prem VA", layers: "DNS only",
      description: "DNS forwarded by a virtual appliance. The VA reports its site, the client's internal IP, and the AD user.",
      sources: ["site", "internalIp", "identity", "network"],
    },
    tunnel: {
      label: "Site-to-site tunnel", layers: "DNS + Firewall + Web",
      description: "Branch traffic sent through an IPsec tunnel to Secure Access.",
      sources: ["tunnel", "internalIp", "identity"],
    },
  };

  const STAGES = {
    dns: { key: "dns", label: "DNS" },
    firewall: { key: "firewall", label: "Firewall" },
    web: { key: "web", label: "Web" },
    private: { key: "private", label: "Private access" },
  };

  const WEB_PORTS = ["80", "443"];
  const PROTOCOLS = ["TCP", "UDP", "ICMP"];

  // ---------------------------------------------------------------------------
  // Destination
  // ---------------------------------------------------------------------------

  function isHostname(value) {
    return /^(?=.{1,253}$)(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i.test(value);
  }

  function parsePort(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (!/^\d{1,5}$/.test(text) || Number(text) < 1 || Number(text) > 65535) return null;
    return String(Number(text));
  }

  // Accepts a domain, an http(s) URL, or an IPv4/IPv6 address with an optional
  // port ("10.0.0.5:445", "[2001:db8::1]:443").
  function parseDestination(text) {
    const value = String(text || "").trim();
    if (!value) return { error: "Enter a destination: a domain, URL, or IP address." };
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      if (!/^https?:\/\//i.test(value)) return { error: "Only http:// and https:// URLs can be checked." };
      let url;
      try { url = new URL(value); } catch (_) { return { error: "That URL could not be read." }; }
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const hostIsIp = !!ip.parse(host);
      if (!hostIsIp && !isHostname(host)) return { error: "The URL needs a domain or IP host." };
      const port = url.port || (url.protocol === "https:" ? "443" : "80");
      return { host, kind: hostIsIp ? "ip" : "domain", port, fromUrl: true };
    }
    const bracketed = value.match(/^\[([0-9a-f:.]+)\](?::(\d+))?$/i);
    if (bracketed && ip.parse(bracketed[1]) && ip.parse(bracketed[1]).version === 6) {
      const port = parsePort(bracketed[2]);
      if (port === null) return { error: "Ports run from 1 to 65535." };
      return { host: bracketed[1], kind: "ip", port };
    }
    if (ip.parse(value)) return { host: value, kind: "ip", port: "" };
    const v4Port = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/);
    if (v4Port && ip.parse(v4Port[1])) {
      const port = parsePort(v4Port[2]);
      if (port === null) return { error: "Ports run from 1 to 65535." };
      return { host: v4Port[1], kind: "ip", port };
    }
    if (ip.parseCidr(value)) return { error: "Enter a single IP address, not a range." };
    if (isHostname(value.replace(/\.$/, ""))) {
      if (value.startsWith("*.")) return { error: "Enter a specific domain, not a wildcard." };
      return { host: value.replace(/\.$/, "").toLowerCase(), kind: "domain", port: "" };
    }
    return { error: "Enter a domain (example.com), a URL (https://example.com/path), or an IP address." };
  }

  function isPrivateIp(value) {
    const parsed = ip.parse(value);
    if (!parsed) return false;
    const ranges = parsed.version === 4
      ? ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10"]
      : ["fc00::/7"];
    return ranges.some(range => ip.contains(value, range));
  }

  function addressMatches(host, address) {
    const target = String(address || "").trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    if (!target) return false;
    if (ip.parse(host)) return ip.parseCidr(target) ? ip.contains(host, target) : false;
    const name = target.split("/")[0].split(":")[0];
    if (name.startsWith("*.")) return host === name.slice(2) || host.endsWith(name.slice(1));
    return host === name;
  }

  // Private Access applies when the destination is a configured private
  // resource; an internal (RFC 1918 / ULA) address is also private traffic.
  function resolveScope(host, lookups) {
    const memberMaps = (lookups && lookups.memberMaps) || {};
    const resources = memberMaps.privateResources || {};
    const addressesOf = (entry, seen) => {
      const out = [];
      for (const member of (entry && entry.members) || []) {
        if (member.value !== undefined) out.push(member.value);
        else if (member.kind === "networkObjects" && member.id !== undefined) {
          const key = `networkObjects:${member.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(...addressesOf((memberMaps.networkObjects || {})[member.id], seen));
        }
      }
      return out;
    };
    const resourceIds = Object.keys(resources).filter(id => addressesOf(resources[id], new Set()).some(address => addressMatches(host, address)));
    const groupIds = Object.keys(memberMaps.privateResourceGroups || {}).filter(id => {
      const members = (memberMaps.privateResourceGroups[id] && memberMaps.privateResourceGroups[id].members) || [];
      return members.some(member => resourceIds.includes(String(member.id)));
    });
    if (resourceIds.length) {
      const names = resourceIds.map(id => (resources[id] && resources[id].name) || (lookups.privateResources && lookups.privateResources[id]) || `Resource ${id}`);
      return { scope: "private_network", privateResourceIds: resourceIds, privateResourceGroupIds: groupIds, resourceNames: names };
    }
    if (isPrivateIp(host)) return { scope: "private_network", privateResourceIds: [], privateResourceGroupIds: [], resourceNames: [] };
    return { scope: "public_internet", privateResourceIds: [], privateResourceGroupIds: [], resourceNames: [] };
  }

  // ---------------------------------------------------------------------------
  // Identities
  // ---------------------------------------------------------------------------

  // Every group that directly or transitively contains one of `ids`, from the
  // AD group membership the service worker prefetches for rule-referenced
  // groups. Returns [{ id, name }] so results can say "via group HR".
  function groupsContaining(ids, memberMaps) {
    const groups = (memberMaps && memberMaps.identityGroups) || {};
    const parents = {};
    for (const [groupId, entry] of Object.entries(groups)) {
      for (const member of (entry && entry.members) || []) {
        if (member && member.id !== undefined) (parents[String(member.id)] = parents[String(member.id)] || []).push(groupId);
      }
    }
    const found = new Map();
    const queue = ids.map(String);
    while (queue.length) {
      const id = queue.shift();
      for (const groupId of parents[id] || []) {
        if (found.has(groupId) || ids.map(String).includes(groupId)) continue;
        found.set(groupId, (groups[groupId] && groups[groupId].name) || `Group ${groupId}`);
        queue.push(groupId);
      }
    }
    return [...found].map(([id, name]) => ({ id, name }));
  }

  function catalogLabel(catalogs, key, id) {
    const entry = catalogs && catalogs[key] && catalogs[key][String(id)];
    if (!entry) return null;
    return typeof entry === "string" ? entry : entry.name || entry.label || entry.displayName || String(id);
  }

  // `form.sources` is { roaming, identity, site, network, tunnel } holding
  // "catalogKey:id" picks, plus { internalIp } as typed text.
  function buildRequest(form, catalogs) {
    const connection = CONNECTIONS[form.connection];
    if (!connection) return { error: "Choose how the traffic connects." };
    const sources = form.sources || {};
    const testInput = {};
    const identities = [];
    for (const kind of connection.sources) {
      const raw = String(sources[kind] || "").trim();
      if (!raw) continue;
      if (kind === "internalIp") {
        if (ip.parseCidr(raw) && !ip.parse(raw)) return { error: "Enter one internal IP address, not a range." };
        if (!ip.parse(raw)) return { error: "The internal client IP is not a valid IPv4 or IPv6 address." };
        testInput.source = raw;
        identities.push({ kind, label: raw });
        continue;
      }
      const split = raw.indexOf(":");
      const catalogKey = raw.slice(0, split);
      const id = raw.slice(split + 1);
      if (!SOURCES[kind].catalogs.includes(catalogKey) || !id) return { error: `Pick a ${SOURCES[kind].label.toLowerCase()} from the list.` };
      const label = catalogLabel(catalogs, catalogKey, id);
      if (!label) return { error: `That ${SOURCES[kind].label.toLowerCase()} is no longer in the loaded catalog. Pick it again.` };
      testInput[CATALOG_INPUT_KEY[catalogKey]] = id;
      identities.push({ kind, catalogKey, id, label });
    }
    if (!identities.length) return { error: `Pick at least one source: ${connection.sources.map(kind => SOURCES[kind].label.toLowerCase()).join(", ")}.` };

    const destination = parseDestination(form.destination);
    if (destination.error) return destination;
    let port = destination.port;
    let protocol = "TCP";
    if (destination.kind === "ip" && !destination.fromUrl) {
      const typedPort = parsePort(form.port);
      if (typedPort === null) return { error: "Ports run from 1 to 65535." };
      port = destination.port || typedPort || "443";
      protocol = PROTOCOLS.includes(String(form.protocol || "").toUpperCase()) ? String(form.protocol).toUpperCase() : "TCP";
      if (protocol === "ICMP") port = "";
    }
    if (form.connection === "va" && destination.kind === "ip") {
      return { error: "An on-prem VA only sees DNS lookups. Enter the domain the client resolves." };
    }
    return {
      request: {
        connection: form.connection,
        identities,
        testInput,
        destination: { ...destination, port: destination.kind === "domain" && !destination.fromUrl ? "443" : port, protocol },
        facts: form.facts || {},
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Stage plan
  // ---------------------------------------------------------------------------

  function planStages(request, scope) {
    const { connection, destination } = request;
    if (scope.scope === "private_network") {
      if (connection === "va") return { stages: [], error: "Private Access is not reached through an on-prem VA. Choose Secure Client or Site-to-site tunnel." };
      return { stages: [{ ...STAGES.private }] };
    }
    const isWebPort = destination.protocol === "TCP" && WEB_PORTS.includes(destination.port);
    const stages = [];
    const skipped = [];
    if (destination.kind === "domain") stages.push({ ...STAGES.dns });
    if (connection === "tunnel") {
      if (destination.kind === "ip") stages.push({ ...STAGES.firewall });
      else skipped.push({ ...STAGES.firewall, reason: "The firewall matches the destination IP. Enter the IP address to include it." });
    }
    if (connection === "client" || connection === "tunnel") {
      if (isWebPort) stages.push({ ...STAGES.web });
      else if (connection === "client") skipped.push({ ...STAGES.web, reason: `Secure Client sends only web traffic (TCP 80/443) to the web proxy; ${destination.protocol} ${destination.port || ""} is not inspected.`.replace(/ ;/, ";") });
    }
    if (!stages.length) return { stages, skipped, error: "Nothing on this connection evaluates that destination. Try a domain or a web port." };
    return { stages, skipped };
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  function applyFacts(testInput, facts) {
    const out = { ...testInput, ruledOut: {} };
    for (const [field, answer] of Object.entries(facts || {})) {
      if (answer.yes && answer.yes.length) out[field] = [...answer.yes];
      if (answer.no && answer.no.length) out.ruledOut[field] = [...answer.no];
    }
    return out;
  }

  function stageInput(request, scope, groups, stage) {
    const base = applyFacts(request.testInput, request.facts);
    const input = {
      ...base,
      sourceIdentityIds: groups.map(group => group.id),
      destination: request.destination.host,
      destinationScope: scope.scope,
      trafficStage: stage.key === "private" ? "" : stage.key,
    };
    if (scope.privateResourceIds.length) input.privateResourceId = scope.privateResourceIds;
    if (scope.privateResourceGroupIds.length) input.privateResourceGroupId = scope.privateResourceGroupIds;
    if (stage.key === "dns") {
      // A lookup reaches the resolver on UDP 53; rules scoped to other ports
      // are about the connection that follows, not the query.
      input.destinationPort = "53";
      input.destinationProtocol = "udp";
    } else if (stage.key === "web") {
      input.destinationPort = request.destination.port;
      input.destinationProtocol = "tcp";
    } else if (stage.key === "firewall" || stage.key === "private") {
      if (request.destination.port) input.destinationPort = request.destination.port;
      input.destinationProtocol = request.destination.protocol.toLowerCase();
    }
    return input;
  }

  function ruleAction(rule) {
    return String((rule && (rule.ruleAction || rule.action)) || "").trim().toLowerCase();
  }

  const ACTION_LABELS = { allow: "Allow", block: "Block", warn: "Warn", isolate: "Isolate" };

  function actionLabel(action) {
    return ACTION_LABELS[action] || (action ? action.charAt(0).toUpperCase() + action.slice(1) : "Unknown");
  }

  function webProfile(rule) {
    const settings = (rule && rule.raw && rule.raw.ruleSettings) || rule && rule.ruleSettings || [];
    const entry = Array.isArray(settings) && settings.find(setting => setting.settingName === "umbrella.posture.webProfileId");
    const value = entry && entry.settingValue;
    return value === undefined || value === null || value === "" ? null : String(value);
  }

  // `matcher` is window.Matcher (or its Node equivalent).
  function evaluate(request, rules, lookups, matcher) {
    lookups = lookups || {};
    const scope = resolveScope(request.destination.host, lookups);
    const plan = planStages(request, scope);
    if (plan.error && !plan.stages.length) return { error: plan.error };
    const directIds = request.identities.filter(identity => identity.id !== undefined).map(identity => identity.id);
    const groups = groupsContaining(directIds, lookups.memberMaps);

    const results = [];
    let blockedAt = null;
    let uncertainBefore = null;
    for (const stage of plan.stages) {
      if (blockedAt) {
        results.push({ stage, state: "not-reached", reason: `Blocked at ${blockedAt.label} first.` });
        continue;
      }
      const input = stageInput(request, scope, groups, stage);
      const match = matcher.matchPolicy(rules, input, lookups);
      if (match && match.indeterminate) {
        results.push({ stage, state: "needs-answer", match, conditional: uncertainBefore });
        if (!uncertainBefore) uncertainBefore = stage;
        continue;
      }
      if (!match || match.noMatch || !match.rule) {
        results.push({ stage, state: "no-match", match, conditional: uncertainBefore });
        continue;
      }
      const action = ruleAction(match.rule);
      results.push({ stage, state: "matched", match, action, conditional: uncertainBefore, webProfileId: stage.key === "web" ? webProfile(match.rule) : null });
      if (action === "block" && !uncertainBefore) blockedAt = stage;
    }
    for (const skipped of plan.skipped || []) results.push({ stage: skipped, state: "skipped", reason: skipped.reason });
    results.sort((a, b) => stageOrder(a.stage.key) - stageOrder(b.stage.key));
    return { scope, groups, stages: results, outcome: outcomeOf(results) };
  }

  function stageOrder(key) {
    return ["dns", "firewall", "web", "private"].indexOf(key);
  }

  function outcomeOf(results) {
    const active = results.filter(result => result.state !== "skipped" && result.state !== "not-reached");
    const pending = active.find(result => result.state === "needs-answer");
    const block = active.find(result => result.state === "matched" && result.action === "block");
    if (block && (!pending || stageOrder(block.stage.key) < stageOrder(pending.stage.key))) {
      return { status: "block", title: `Blocked at ${block.stage.label}`, stage: block.stage.key, rule: block.match.rule };
    }
    if (pending) return { status: "pending", title: "Needs one more detail", stage: pending.stage.key };
    if (active.some(result => result.state === "no-match")) return { status: "unknown", title: "No rule matched", stage: null };
    const last = active[active.length - 1];
    if (!last) return { status: "unknown", title: "Not evaluated", stage: null };
    const status = ACTION_LABELS[last.action] ? last.action : "unknown";
    const title = status === "allow" ? "Allowed" : status === "warn" ? "Warned" : status === "isolate" ? "Isolated" : actionLabel(last.action);
    return { status, title, stage: last.stage.key, rule: last.match.rule };
  }

  // ---------------------------------------------------------------------------
  // Questions — turn an indeterminate stage into a multiple-choice prompt
  // ---------------------------------------------------------------------------

  const QUESTION_FIELDS = {
    contentCategoryId: { noun: "content category", catalogs: ["contentCategories"] },
    applicationId: { noun: "application", catalogs: ["applications", "enterpriseApplications", "apps", "protocols"] },
    applicationCategoryId: { noun: "application category", catalogs: ["applicationCategories"] },
    applicationListId: { noun: "application list", catalogs: ["applicationLists"] },
    categoryListId: { noun: "category list", catalogs: ["categoryLists"] },
    appRiskProfileId: { noun: "app risk profile", catalogs: ["appRiskProfiles"] },
    geolocation: { noun: "location", catalogs: ["geolocations"] },
  };

  function valueLabel(field, id, lookups) {
    const config = QUESTION_FIELDS[field];
    for (const key of (config && config.catalogs) || []) {
      const label = catalogLabel(lookups, key, id);
      if (label) return label;
    }
    if (field === "contentCategoryId" && lookups.categories) {
      const entry = Object.values(lookups.categories).find(item => item && String(item.categoryId) === String(id));
      if (entry) return entry.name;
    }
    return `${config ? config.noun.charAt(0).toUpperCase() + config.noun.slice(1) : "Value"} ${id}`;
  }

  // A list's members, for a hint like "Gambling, Games, +3 more".
  function listPreview(field, id, lookups) {
    const kind = field === "categoryListId" ? "categoryLists" : field === "applicationListId" ? "applicationLists" : null;
    const entry = kind && lookups.memberMaps && lookups.memberMaps[kind] && lookups.memberMaps[kind][String(id)];
    if (!entry || !entry.members || !entry.members.length) return "";
    const memberField = kind === "categoryLists" ? "contentCategoryId" : "applicationId";
    const names = entry.members.slice(0, 3).map(member => member.name || valueLabel(memberField, member.id, lookups));
    return names.join(", ") + (entry.members.length > 3 ? `, +${entry.members.length - 3} more` : "");
  }

  function questionFor(result, host, lookups) {
    const pending = (result.match && result.match.pending) || [];
    if (!pending.length) return null;
    const rule = result.match.rule;
    return {
      stage: result.stage.key,
      ruleName: rule.ruleName || rule.name || "Unnamed rule",
      host,
      prompt: `Is ${host} any of these?`,
      groups: pending.map(item => ({
        field: item.field,
        noun: (QUESTION_FIELDS[item.field] || { noun: "value" }).noun,
        options: item.ids.map(id => ({ id: String(id), label: valueLabel(item.field, id, lookups), hint: listPreview(item.field, id, lookups) })),
      })),
    };
  }

  // Merge an answer (the ids the user ticked) into the request's facts. Every
  // option offered and not ticked is recorded as ruled out.
  function answer(facts, question, pickedIds) {
    const next = JSON.parse(JSON.stringify(facts || {}));
    const picked = new Set((pickedIds || []).map(String));
    for (const group of question.groups) {
      const entry = next[group.field] = next[group.field] || { yes: [], no: [] };
      for (const option of group.options) {
        const list = picked.has(option.id) ? entry.yes : entry.no;
        if (!list.includes(option.id)) list.push(option.id);
      }
    }
    return next;
  }

  root.TrafficPath = {
    CONNECTIONS, SOURCES, STAGES, PROTOCOLS,
    parseDestination, resolveScope, groupsContaining, buildRequest, planStages,
    evaluate, questionFor, answer, actionLabel, webProfile, catalogLabel, valueLabel,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.TrafficPath;
})(typeof window !== "undefined" ? window : globalThis);
