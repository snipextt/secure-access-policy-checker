(function (root) {
  "use strict";

  const PATHS = {
    client: {
      label: "Secure Client", transport: "DNS + web",
      description: "Traffic from an enrolled roaming computer. Select its user, group, or computer identity.",
      sources: ["user", "group", "roaming"], layers: ["dns", "web"],
    },
    va: {
      label: "On-prem VA", transport: "DNS only",
      description: "DNS through an on-prem virtual appliance. Choose a mapped user, group, site, or internal client IP.",
      sources: ["user", "group", "site", "internalIp"], layers: ["dns"],
    },
    tunnel: {
      label: "S2S tunnel", transport: "DNS + web",
      description: "Site-to-site traffic. Choose a user, group, or client IP; the tunnel identity itself is not inferred.",
      sources: ["user", "group", "internalIp"], layers: ["dns", "web"],
    },
  };

  const SOURCES = {
    user: { label: "User", catalog: "sourceUsers", inputKey: "sourceUserId" },
    group: { label: "User group", catalog: "sourceGroups", inputKey: "sourceGroupId" },
    roaming: { label: "Roaming computer", catalog: "sourceRoaming", inputKey: "sourceRoamingId" },
    site: { label: "Site", catalog: "sourceSites", inputKey: "sourceSiteId" },
    internalIp: { label: "Internal client IPv4", inputKey: "source" },
  };

  function validIPv4(text) {
    const parts = text.split(".");
    return parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  }

  function ipv4OrCidr(text) {
    const [address, prefix, extra] = text.split("/");
    return extra === undefined && validIPv4(address) &&
      (prefix === undefined || /^(0|[1-9]|[12]\d|3[0-2])$/.test(prefix));
  }

  function normalizeDestination(text) {
    const value = String(text || "").trim();
    if (!value) return { error: "Enter a destination domain, URL, IP, or CIDR." };
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (!url.hostname || url.username || url.password) return { error: "Enter a valid HTTP(S) destination URL." };
        return { destination: url.hostname, note: "Only the URL host is checked; path, query, and scheme are not evaluated." };
      } catch (_) { return { error: "Enter a valid HTTP(S) destination URL." }; }
    }
    const kind = root.TesterTaxonomy && root.TesterTaxonomy.classifyDestinationValue(value);
    if (ipv4OrCidr(value) || kind === "fqdn" && !/[/:?#\s]/.test(value) && !/^\d+(?:\.\d+){3}$/.test(value)) return { destination: value };
    return { error: "Enter a domain, HTTP(S) URL, or IPv4 address/CIDR. Ports and IPv6 are not evaluated in this flow." };
  }

  function sourceForPath(path, kind, value, catalogs) {
    const config = PATHS[path];
    if (!config || !config.sources.includes(kind)) return { error: "Select a source supported by this traffic path." };
    const source = SOURCES[kind];
    if (kind === "internalIp") {
      if (!ipv4OrCidr(String(value || "").trim())) return { error: "Enter a valid IPv4 client address or CIDR (IPv6 is not evaluated)." };
      return { source: value.trim() };
    }
    const entries = catalogs && catalogs[source.catalog];
    if (!entries || !Object.prototype.hasOwnProperty.call(entries, String(value))) {
      return { error: "Select a source from the loaded catalog; a name alone cannot identify its rule." };
    }
    return { [source.inputKey]: String(value) };
  }

  function buildInput({ path, sourceKind, sourceValue, destination, scope }, catalogs) {
    const pathModes = PATHS[path];
    const parsed = normalizeDestination(destination);
    if (parsed.error) return parsed;
    if (!pathModes) return { error: "Choose a traffic path and source type." };
    if (!pathModes.sources.includes(sourceKind)) return { error: "Select a source supported by this traffic path." };
    const selected = sourceForPath(path, sourceKind, sourceValue, catalogs);
    if (selected.error) return selected;
    if (selected.source && selected.source.includes("/")) {
      if (!selected.source.endsWith("/32")) return { error: "A CIDR contains multiple clients; enter one IPv4 address to check a single request." };
      selected.source = selected.source.slice(0, -3);
    }
    if (parsed.destination.includes("/")) {
      if (!parsed.destination.endsWith("/32")) return { error: "A destination CIDR contains multiple hosts; enter one IPv4 address to check a single request." };
      parsed.destination = parsed.destination.slice(0, -3);
    }
    const isIp = ipv4OrCidr(parsed.destination);
    if (isIp && !["public_internet", "private_network"].includes(scope)) {
      return { error: "Choose Internet or Private Access for an IP destination; its scope cannot be inferred." };
    }
    const testInput = { ...selected, destination: parsed.destination, destinationScope: scope || "" };
    return { testInput, note: parsed.note || "" };
  }

  function layerSummary(path, match) {
    const config = PATHS[path];
    const available = Boolean(config);
    const profile = match && !match.noMatch && match.rule && match.rule.security_profiles;
    return [
      { key: "dns", label: "DNS", status: available ? "not-evaluated" : "unavailable", detail: "DNS policy rules and request logs are not loaded." },
      { key: "web", label: "Web", status: available && config.layers.includes("web") ? "not-evaluated" : "not-applicable", detail: available && config.layers.includes("web") ? "Web policy rules and request logs are not loaded." : "This path is DNS-only in this model." },
      { key: "decrypt", label: "Decrypt", status: available && config.layers.includes("web") ? "not-evaluated" : "not-applicable", detail: profile && profile.tls_decryption_enabled ? "A TLS inspection profile is configured on the matched access rule; no decryption verdict is available." : "No decryption verdict is available from the loaded rules." },
      { key: "dlp", label: "DLP", status: available && config.layers.includes("web") ? "not-evaluated" : "not-applicable", detail: profile && profile.dlp_enabled ? "A tenant-control profile is configured on the matched access rule; no DLP verdict is available." : "No DLP verdict is available from the loaded rules." },
    ];
  }

  root.TrafficPath = { PATHS, SOURCES, normalizeDestination, sourceForPath, buildInput, layerSummary };
  if (typeof module !== "undefined" && module.exports) module.exports = root.TrafficPath;
})(typeof window !== "undefined" ? window : globalThis);
