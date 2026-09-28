(function (root) {
  "use strict";

  const PATHS = {
    client: {
      label: "Secure Client", transport: "DNS + Web", stageBasis: "transcript", stages: ["dns", "web"],
      description: "Traffic from an enrolled roaming computer. Select its user, group, or computer identity.",
      sources: ["user", "group", "roaming"],
    },
    va: {
      label: "On-prem VA", transport: "DNS only", stageBasis: "transcript", stages: ["dns"],
      description: "DNS through an on-prem virtual appliance. Choose a mapped user, group, site, or internal client IP.",
      sources: ["user", "group", "site", "internalIp"],
    },
    tunnel: {
      label: "S2S tunnel", transport: "DNS + Web", stageBasis: "inferred", stages: ["dns", "web"],
      description: "Site-to-site traffic. Choose a user, group, client IP, or configured tunnel identity.",
      sources: ["user", "group", "internalIp", "tunnelGroup"],
    },
  };

  const STAGES = {
    dns: { key: "dns", label: "DNS", eventType: "dns" },
    web: { key: "web", label: "Web", eventType: "proxy" },
  };
  const TRAFFIC_KINDS = {
    auto: "Infer from destination",
    dns: "DNS query",
    web: "HTTP(S) web request",
  };

  const ip = root.IPAddress;
  const SOURCES = {
    user: { label: "User", catalog: "sourceUsers", inputKey: "sourceUserId" },
    group: { label: "User group", catalog: "sourceGroups", inputKey: "sourceGroupId" },
    roaming: { label: "Roaming computer", catalog: "sourceRoaming", inputKey: "sourceRoamingId" },
    site: { label: "Site", catalog: "sourceSites", inputKey: "sourceSiteId" },
    tunnelGroup: { label: "Network tunnel", catalog: "sourceTunnelGroups", inputKey: "sourceTunnelGroupId" },
    internalIp: { label: "Internal client IP", inputKey: "source" },
  };

  function stagesForPath(path, scenario = {}) {
    const config = PATHS[path];
    if (!config) return [];
    if (scenario.destinationScope === "private_network") return [{ key: "private", label: "Private access", eventType: null, basis: "destination scope", certainty: "expected" }];
    const { trafficKind = "auto", destinationKind = "domain" } = scenario;
    const selected = trafficKind === "dns" ? ["dns"]
      : trafficKind === "web" ? (["ip", "url-ip"].includes(destinationKind) ? ["web"] : ["dns", "web"])
        : destinationKind === "ip" ? [] : destinationKind === "url-ip" ? ["web"] : destinationKind === "url" ? ["dns", "web"] : config.stages;
    return selected.filter(key => config.stages.includes(key)).map(key => ({
      ...STAGES[key], basis: config.stageBasis,
      certainty: trafficKind === "auto" && destinationKind === "domain" || key === "dns" && trafficKind === "web" || key === "dns" && destinationKind === "url"
        ? "possible" : "expected",
    }));
  }

  function stageReport(path, scenario = {}) {
    return stagesForPath(path, scenario);
  }

  function ipOrCidr(text) {
    return !!ip.parseCidr(text);
  }

  function normalizeDestination(text) {
    const value = String(text || "").trim();
    if (!value) return { error: "Enter a destination domain, URL, IP, or CIDR." };
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        const host = url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname;
        const isIpHost = !!ip.parse(host);
        if (!host || url.username || url.password || !(isIpHost || root.TesterTaxonomy && root.TesterTaxonomy.classifyDestinationValue(host) === "fqdn")) {
          return { error: "Enter a valid HTTP(S) destination URL with a domain or IP host." };
        }
        return { destination: host, destinationKind: isIpHost ? "url-ip" : "url", note: "URL host and Web port are checked; path, query, and scheme are not evaluated." };
      } catch (_) { return { error: "Enter a valid HTTP(S) destination URL." }; }
    }
    const kind = root.TesterTaxonomy && root.TesterTaxonomy.classifyDestinationValue(value);
    if (ipOrCidr(value)) return { destination: value, destinationKind: "ip" };
    if (kind === "fqdn" && !/[/:?#\s]/.test(value) && !/^\d+(?:\.\d+){3}$/.test(value) && !value.includes(":")) return { destination: value, destinationKind: "domain" };
    return { error: "Enter a domain, HTTP(S) URL, or IPv4/IPv6 address. Ports require a URL." };
  }

  function sourceForPath(path, kind, value, catalogs) {
    const config = PATHS[path];
    if (!config || !config.sources.includes(kind)) return { error: "Select a source supported by this traffic path." };
    const source = SOURCES[kind];
    if (kind === "internalIp") {
      if (!ipOrCidr(String(value || "").trim())) return { error: "Enter a valid IPv4 or IPv6 client address." };
      return { source: value.trim() };
    }
    const entries = catalogs && catalogs[source.catalog];
    if (!entries || !Object.prototype.hasOwnProperty.call(entries, String(value))) {
      return { error: "Select a source from the loaded catalog; a name alone cannot identify its rule." };
    }
    return { [source.inputKey]: String(value) };
  }

  function buildInput({ path, sourceKind, sourceValue, destination, scope, trafficKind = "auto", webSteering = "unknown" }, catalogs) {
    const pathModes = PATHS[path];
    const parsed = normalizeDestination(destination);
    if (parsed.error) return parsed;
    if (!pathModes) return { error: "Choose a traffic path and source type." };
    if (!pathModes.sources.includes(sourceKind)) return { error: "Select a source supported by this traffic path." };
    const selected = sourceForPath(path, sourceKind, sourceValue, catalogs);
    if (selected.error) return selected;
    if (selected.source && selected.source.includes("/")) {
      const cidr = ip.parseCidr(selected.source);
      if (cidr.prefix !== (cidr.version === 4 ? 32 : 128)) return { error: "A CIDR contains multiple clients; enter one IP address to check a single request." };
      selected.source = selected.source.slice(0, selected.source.lastIndexOf("/"));
    }
    if (parsed.destination.includes("/")) {
      const cidr = ip.parseCidr(parsed.destination);
      if (cidr.prefix !== (cidr.version === 4 ? 32 : 128)) return { error: "A destination CIDR contains multiple hosts; enter one IP address to check a single request." };
      parsed.destination = parsed.destination.slice(0, parsed.destination.lastIndexOf("/"));
    }
    const isIp = ipOrCidr(parsed.destination);
    if (isIp && !["public_internet", "private_network"].includes(scope)) {
      return { error: "Choose Internet or Private Access for an IP destination; its scope cannot be inferred." };
    }
    if (!Object.hasOwn(TRAFFIC_KINDS, trafficKind)) return { error: "Choose a traffic type." };
    if (!["unknown", "yes", "no"].includes(webSteering)) return { error: "Choose a web routing option." };
    if (path === "va" && scope === "private_network") return { error: "Private Access is not evaluated through the on-prem VA path. Choose another traffic path." };
    if (scope !== "private_network" && trafficKind === "dns" && (isIp || parsed.destinationKind === "url-ip")) return { error: "A DNS query needs a domain, not an IP destination." };
    if (scope !== "private_network" && trafficKind === "dns" && parsed.destinationKind === "url") return { error: "For a DNS query, enter a domain instead of a URL." };
    if (scope !== "private_network" && !pathModes.stages.includes("web") && (trafficKind === "web" || parsed.destinationKind === "url" || parsed.destinationKind === "url-ip")) {
      return { error: "This path only covers DNS. Enter a domain or choose another traffic path for Web." };
    }
    if (trafficKind === "auto" && parsed.destinationKind === "ip" && scope !== "private_network") {
      return { error: "Choose Web for an IP destination; an IP alone does not identify its traffic service." };
    }
    const webPort = parsed.destinationKind === "url" || parsed.destinationKind === "url-ip" ? (new URL(String(destination).trim()).port || (/^https:/i.test(destination) ? "443" : "80")) : "";
    const testInput = { ...selected, destination: parsed.destination, destinationScope: scope || "" };
    return { testInput, scenario: { trafficKind, destinationKind: parsed.destinationKind, destinationScope: scope || "", webPort, webSteering }, note: parsed.note || "" };
  }

  function stageInput(testInput, scenario, stage) {
    const input = { ...testInput, trafficStage: stage };
    if (stage === "web") {
      const port = scenario && scenario.webPort;
      if (port) input.destinationPort = String(port);
      input.destinationProtocol = "tcp";
    }
    return input;
  }

  function webProfile(rule) {
    const settings = (rule && rule.raw && rule.raw.ruleSettings) || [];
    const entry = settings.find(setting => setting.settingName === "umbrella.posture.webProfileId");
    const value = entry && entry.settingValue;
    return value === undefined || value === null || value === "" ? null : String(value);
  }

  function evaluateStages(path, prepared, matchPolicy) {
    const stages = stagesForPath(path, prepared.scenario);
    let dnsOutcome = "";
    return stages.map(stage => {
      if (stage.key === "web" && dnsOutcome === "blocked") return { stage, state: "not-reached" };
      if (stage.key === "web" && prepared.scenario.webSteering === "no") return { stage, state: "not-routed" };
      if (stage.key === "web" && prepared.scenario.webPort && !["80", "443"].includes(prepared.scenario.webPort)) return { stage, state: "needs-routing" };
      const match = matchPolicy(stageInput(prepared.testInput, prepared.scenario, stage.key));
      const state = match && match.indeterminate ? "needs-context" : match && match.rule && !match.noMatch ? "matched" : "no-match";
      if (stage.key === "dns" && (state === "needs-context" || state === "no-match")) dnsOutcome = "unknown";
      if (stage.key === "dns" && state === "matched") {
        const action = String(match.rule.ruleAction || match.rule.action).toLowerCase();
        if (action === "block") dnsOutcome = "blocked";
        else if (action !== "allow") dnsOutcome = "unknown";
      }
      return { stage, state, match, conditional: stage.key === "web" && (prepared.scenario.webSteering !== "yes" || dnsOutcome === "unknown"), dnsUnresolved: stage.key === "web" && dnsOutcome === "unknown" };
    });
  }

  function policyLayer(match) {
    if (!match || match.noMatch || !match.rule) {
      return {
        key: "access-policy", label: "Access policy", status: "unresolved", action: "No matching rule",
        detail: "No access rule matched the loaded rules; this is not an allow or block decision.",
      };
    }
    const action = String(match.rule.ruleAction || match.rule.action || "").trim().toLowerCase();
    const labels = { allow: "Allow", block: "Block", warn: "Warn", isolate: "Isolate" };
    return {
      key: "access-policy", label: "Access policy", status: labels[action] ? action : "unknown",
      action: labels[action] || "Unknown action",
      detail: "Predicted from the matched access rule; not an observed traffic verdict.",
    };
  }

  root.TrafficPath = { PATHS, SOURCES, TRAFFIC_KINDS, normalizeDestination, sourceForPath, buildInput, stagesForPath, stageReport, stageInput, evaluateStages, webProfile, policyLayer };
  if (typeof module !== "undefined" && module.exports) module.exports = root.TrafficPath;
})(typeof window !== "undefined" ? window : globalThis);
