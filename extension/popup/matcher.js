// =============================================================================
// matcher.js — Policy Match Tester engine
// Exported via window.Matcher so popup.js and popup-sections.js can use it
// without a module bundler (plain <script> tags in popup.html).
//
// This file has NO browser-extension API calls.  Pure data-in / data-out.
//
// SCHEMA HISTORY (real Umbrella API captures):
//
//   Capture 1 — 2026-07-04 — default rules only:
//     attributeName: "umbrella.source.all"      attributeOperator: "="  attributeValue: true
//     attributeName: "umbrella.destination.all" attributeOperator: "="  attributeValue: true
//
//   Capture 2 — 2026-07-04 — first real custom rule:
//     attributeName: "umbrella.source.all"                 attributeOperator: "="   attributeValue: true
//     attributeName: "umbrella.destination.composite_inline_ip"
//                                                          attributeOperator: "IN"
//                                                          attributeValue: [
//                                                            { ip: ["93.184.216.0/24"],
//                                                              port: ["0-65535"],
//                                                              protocol: "ANY" }
//                                                          ]
//
//   Key learnings from capture 2:
//     - attributeValue can be an ARRAY OF OBJECTS (not just scalars).
//     - attributeOperator can be "IN" (not just "=").
//     - composite_inline_ip objects have { ip: string[], port: string[], protocol: string }.
//     - port/protocol are present but NOT matched by the tester (no UI fields for them yet).
//       They are included in matchedConditions output for visibility only.
//
// CONFIRMED attributeNames (from real captures):
//   umbrella.source.all                           (op "=",         value true)                   → source catch-all
//   umbrella.destination.all                      (op "=",         value true)                   → dest catch-all
//   umbrella.destination.composite_inline_ip      (op "IN",        value [{ip,port,protocol}])   → CIDR list for destination
//   umbrella.source.identity_ids                  (op "INTERSECT", value [numericIDs])           → source identity
//   umbrella.destination.application_category_ids (op "INTERSECT", value [numericIDs])           → destination app category
//   umbrella.destination.category_ids              (op "INTERSECT", value [numericIDs])           → destination app category
//                                                          (alias of application_category_ids — confirmed org 8416432 uses
//                                                           this shorter field name for the same concept; org 8415583 uses
//                                                           the longer one. attributeName is NOT universal across tenants.)
//   umbrella.destination.application_ids          (op "INTERSECT", value [numericIDs])           → destination app OR protocol
//                                                          (CONFIRMED via live API payload: this is the ONLY field used for
//                                                           both "Internet Application" and "Application Protocol" selections
//                                                           — there is NO separate umbrella.destination.protocol_ids field.
//                                                           e.g. ID 6500000 = "3com-amp3", a protocol, appearing under this
//                                                           same attributeName. Resolve against apps-lookup.json first, then
//                                                           protocols-lookup.json — see summarizeConditions() in
//                                                           popup-sections.js.)
//
// All other patterns are still UNCONFIRMED and marked with TODO.
// =============================================================================

(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // CIDR / IP helpers  (schema-independent)
  // ---------------------------------------------------------------------------

  /**
   * Parse an IPv4 address string into a 32-bit unsigned integer.
   * Returns NaN if the string is not a valid dotted-decimal IPv4 address.
   *
   * @param {string} ip
   * @returns {number}
   */
  function ipv4ToInt(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4) return NaN;
    let n = 0;
    for (const part of parts) {
      const octet = parseInt(part, 10);
      if (isNaN(octet) || octet < 0 || octet > 255) return NaN;
      n = (n << 8) | octet;
    }
    return n >>> 0;  // >>> 0 forces unsigned 32-bit
  }

  /**
   * Return true if `ip` falls within the network described by `cidr`.
   * Supports bare IPs (treated as /32) and standard CIDR notation.
   *
   * TODO: IPv6 support not yet implemented.
   *
   * @param {string} ip   — test IP (from user input)
   * @param {string} cidr — CIDR block to test against
   * @returns {boolean}
   */
  function cidrMatch(ip, cidr) {
    if (!ip || !cidr) return false;
    if (ip.includes(":") || cidr.includes(":")) {
      console.warn("[matcher] IPv6 CIDR matching not yet implemented:", cidr);
      return false;
    }
    const [network, prefixStr] = cidr.split("/");
    const prefixLen = prefixStr !== undefined ? parseInt(prefixStr, 10) : 32;
    if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;
    const ipInt      = ipv4ToInt(ip);
    const networkInt = ipv4ToInt(network);
    if (isNaN(ipInt) || isNaN(networkInt)) return false;
    const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
    return (ipInt & mask) >>> 0 === (networkInt & mask) >>> 0;
  }

  /**
   * Return true if `value` matches `pattern`.
   * Pattern may be: plain FQDN / URL substring, leading-wildcard "*.example.com", or "*".
   * Matching is case-insensitive.
   *
   * @param {string} pattern
   * @param {string} value
   * @returns {boolean}
   */
  function fqdnMatch(pattern, value) {
    if (!pattern || !value) return false;
    const p = pattern.toLowerCase().trim();
    const v = value.toLowerCase().trim();
    if (p === "*") return true;
    if (p.startsWith("*.")) {
      const suffix = p.slice(2);
      return v === suffix || v.endsWith("." + suffix);
    }
    return v === p || v.includes(p) || p.includes(v);
  }

  // ===========================================================================
  // REAL SCHEMA — primary matching path (Umbrella API ruleConditions[])
  // ===========================================================================

  /**
   * Map a ruleCondition attributeName to a logical dimension:
   *   "source" | "destination" | "identity" | "app" | "unknown"
   *
   * Uses the Umbrella dotted-namespace convention (umbrella.<dim>.<type>).
   * Exact matches for confirmed names are listed first; prefix matches follow.
   *
   * @param {string} attributeName
   * @returns {"source"|"destination"|"identity"|"app"|"unknown"}
   */
  function conditionDimension(attributeName) {
    const an = attributeName.toLowerCase();

    // --- CONFIRMED from real captures ---
    if (an === "umbrella.source.all")                      return "source";
    if (an === "umbrella.destination.all")                 return "destination";
    if (an === "umbrella.destination.composite_inline_ip") return "destination"; // capture 2
    if (an === "umbrella.source.composite_inline_ip")      return "source";      // prepped

    // --- Fallbacks for identity/app (no exact pattern known yet) ---
    if (an.includes("identity_type")) return "identity";  // identity_type_ids - filter by identity TYPE
    if (an.includes("identity")) return "identity";
    // "category" covers both confirmed field-name variants for content/app
    // category matching: "application_category_ids" (org 8415583) and the
    // shorter "category_ids" (org 8416432) — same INTERSECT semantics, just
    // a different attributeName string per tenant.
    if (an.includes("application") || an.includes("app") || an.includes("protocol") || an.includes("category")) return "app";

    // CONFIRMED via live API payload (org 8176184): all destination-scoped —
    // same classification service-worker.js's _conditionDimension() already
    // uses for checkConflicts/checkShadowing/checkInspection (kept in sync
    // here rather than shared, since that file's a service worker context
    // and this one's a plain IIFE loaded into the popup — see that file's
    // comment for why they're duplicated instead of shared).
    //   - destination_list_ids / "geo"-style conditions (Geoblocking2, etc.)
    //   - private_resource_ids / private_resource_group_ids — which private
    //     app/resource group a Private Access rule's destination targets
    //   - networkObjectIds / serviceObjectGroupIds — named network/service
    //     object references (api.sse.cisco.com/policies/v2/objects/*)
    // None of these have a corresponding Policy Tester input field yet (no
    // "which private resource" or "which network object" field exists), so
    // classifying them correctly here stops them being silently miscounted
    // as "unknown" — but a rule with a real (non-catch-all) condition of
    // these types still can't be MATCHED through the tester today, only
    // correctly reported as such instead of via the wrong code path.
    if (
      an.includes("destination_list") ||
      an.includes("geo") ||
      an.includes("private_resource") ||
      an.includes("networkobjectids") ||
      an.includes("serviceobjectgroupids")
    ) return "destination";

    console.warn("[matcher] Unrecognised attributeName pattern:", attributeName);
    return "unknown";
  }

  // ---------------------------------------------------------------------------
  // Composite value extractors — handle the object-array shape from capture 2
  // ---------------------------------------------------------------------------

  /**
   * Extract all IP/CIDR strings from a composite_inline_ip attributeValue array.
   *
   * Shape confirmed from capture 2:
   *   attributeValue: [{ ip: ["93.184.216.0/24"], port: ["0-65535"], protocol: "ANY" }]
   *
   * Each element's `ip` field is an array of CIDR strings.  We flatten all of
   * them into a single list so the caller can iterate and cidrMatch/fqdnMatch.
   *
   * Also returns a port/protocol summary string for display in matchedConditions
   * (not used for matching — the tester has no port/protocol input fields yet).
   *
   * @param {object[]} compositeArr  — attributeValue array of composite objects
   * @returns {{ cidrs: string[], portProtocolNote: string }}
   */
  function extractCompositeInlineIp(compositeArr) {
    const items = [];
    const notes = [];

    for (const entry of compositeArr) {
      if (typeof entry === "string") {
        if (entry.trim()) {
          items.push({ cidr: entry.trim(), ports: ["any"] });
        }
        continue;
      }
      if (typeof entry === "object" && entry !== null) {
        let ports = ["any"];
        if (Array.isArray(entry.port) && entry.port.length > 0) {
          ports = entry.port.map(String);
        } else if (typeof entry.port === "string") {
          ports = [entry.port];
        } else if (typeof entry.port === "number") {
          ports = [String(entry.port)];
        }

        let entryCidrs = [];
        if (Array.isArray(entry.ip)) {
          for (const cidr of entry.ip) {
            if (typeof cidr === "string" && cidr.trim()) {
              entryCidrs.push(cidr.trim());
            }
          }
        } else if (typeof entry.ip === "string") {
          entryCidrs.push(entry.ip.trim());
        }
        
        for (const cidr of entryCidrs) {
          items.push({ cidr, ports });
        }
        
        // port/protocol: include in note but do NOT use for matching
        const portStr     = Array.isArray(entry.port)    ? entry.port.join(", ")    : (entry.port    || "any");
        const protoStr    = typeof entry.protocol === "string" ? entry.protocol    : "any";
        notes.push(`port ${portStr}, protocol ${protoStr}`);
      }
    }

    return {
      items,
      cidrs: items.map(i => i.cidr),
      portProtocolNote: notes.length ? notes.join("; ") : "any port, any protocol",
    };
  }

  // ---------------------------------------------------------------------------
  // matchConditionValue — operator-aware, shape-aware condition evaluator
  // ---------------------------------------------------------------------------

  /**
   * Return whether a single ruleCondition matches the user-supplied testValue
   * for the given logical dimension.
   *
   * Branches first on attributeOperator ("=" / "IN" / unconfirmed others),
   * then on the shape of attributeValue (boolean / string / composite object array).
   *
   * Confirmed operators from real captures:
   *   "="  — equality / catch-all (attributeValue: true or a scalar)
   *   "IN" — membership (attributeValue: array of composite objects or scalars)
   *
   * @param {object} cond       — { attributeName, attributeOperator, attributeValue }
   * @param {string} dimension  — "source" | "destination" | "identity" | "app"
   * @param {string} testValue  — user-supplied field (non-empty, pre-trimmed)
   * @returns {{ matched: boolean, note: string }}
   */
  function portMatch(testPort, portRanges) {
    if (!testPort) return true;
    if (!portRanges || portRanges.length === 0) return true;
    const tp = parseInt(testPort, 10);
    if (isNaN(tp)) return false;

    for (const rangeStr of portRanges) {
      const r = String(rangeStr).toLowerCase().trim();
      if (r === "any" || r === "*") return true;
      if (r.includes("-")) {
        const [start, end] = r.split("-");
        const s = parseInt(start, 10);
        const e = parseInt(end, 10);
        if (!isNaN(s) && !isNaN(e) && tp >= s && tp <= e) return true;
      } else {
        const p = parseInt(r, 10);
        if (!isNaN(p) && p === tp) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // resolveDisplayValue — turns a raw identity/category/application ID into a
  // human-readable name for "MATCHED BECAUSE" reasoning text, the same
  // resolution popup-sections.js's summarizeConditions() already does for the
  // Rules tab's "What will usually match" section. Source/destination values
  // (IPs, CIDRs, FQDNs) are already human-readable and pass through
  // untouched — only identity/app-dimension numeric IDs need resolving.
  //
  // `lookups` is optional and defaults to {} so existing callers (and any
  // unit tests) that don't pass one keep working — falls back to showing the
  // raw ID in that case, same as an unresolved ID would.
  // ---------------------------------------------------------------------------
  function resolveDisplayValue(dimension, attributeName, id, lookups) {
    lookups = lookups || {};
    const an = (attributeName || "").toLowerCase();

    if (dimension === "identity") {
      const name = lookups.identities && lookups.identities[String(id)];
      return name || `[unknown identity ${id}]`;
    }

    if (dimension === "app") {
      if (an.includes("category")) {
        const entry = lookups.categories && lookups.categories[id];
        if (entry) return typeof entry === "object" ? entry.name : entry;
        return `[unknown category ${id}]`;
      }
      if (an.includes("application")) {
        if (lookups.apps && lookups.apps[id] !== undefined) return lookups.apps[id];
        if (lookups.protocols && lookups.protocols[id] !== undefined) return lookups.protocols[id];
        return `[unknown app ${id}]`;
      }
    }

    if (dimension === "destination" && an.includes("private_resource")) {
      const name = lookups.objects && lookups.objects[String(id)];
      return name || `Resource #${id}`;
    }

    if (dimension === "destination" && an.includes("destination_list")) {
      const name = lookups.destinationLists && lookups.destinationLists[String(id)];
      return name || `[unknown destination list ${id}]`;
    }

    if (dimension === "destination" && (an.includes("network_object") || an.includes("networkobject"))) {
      const name = lookups.networkObjects && lookups.networkObjects[String(id)];
      return name || `[unknown network object ${id}]`;
    }

    if (dimension === "destination" && (an.includes("service_object") || an.includes("serviceobject"))) {
      const name = lookups.serviceObjectGroups && lookups.serviceObjectGroups[String(id)];
      return name || `[unknown service object group ${id}]`;
    }

    if (dimension === "destination" && an.includes("application_list")) {
      const name = lookups.applicationLists && lookups.applicationLists[String(id)];
      return name || `[unknown application list ${id}]`;
    }

    if (dimension === "destination" && an.includes("category_list")) {
      const name = lookups.categoryLists && lookups.categoryLists[String(id)];
      return name || `[unknown category list ${id}]`;
    }

    // source/destination (IPs/CIDRs/FQDNs) and anything else: already
    // human-readable, no lookup applies.
    return String(id);
  }

  function matchConditionValue(cond, dimension, testValue, testPort = null, lookups = {}, testInput = {}) {
    const { attributeName, attributeOperator, attributeValue } = cond;
    const tvObj = typeof testValue === "object" && testValue !== null ? testValue : null;
    const tv  = tvObj ? "" : String(testValue).trim();
    const an  = attributeName.toLowerCase();
    const op  = (attributeOperator || "=").toUpperCase();

    // Extract all destination object IDs from testInput
    const { privateResourceId = null, destinationListId = null, networkObjectId = null,
            serviceObjectGroupId = null, applicationListId = null, categoryListId = null } = testInput;

    // =========================================================================
    // OPERATOR: "="
    // =========================================================================
    if (op === "=") {
      // -----------------------------------------------------------------------
      // CONFIRMED — catch-all: attributeValue === true AND name ends with ".all"
      // Both confirmed cases:  umbrella.source.all = true
      //                        umbrella.destination.all = true
      // -----------------------------------------------------------------------
      if (attributeValue === true && an.endsWith(".all")) {
        return {
          matched: true,
          note: `${dimension}: catch-all condition (${attributeName} = true)`,
          display: "Any",
        };
      }

      // -----------------------------------------------------------------------
      // CONFIRMED — "=" with a plain string value
      // -----------------------------------------------------------------------
      if (typeof attributeValue === "string") {
        const av = attributeValue.trim();
        if (dimension === "source" || dimension === "destination") {
          if (cidrMatch(tv, av)) {
            return { matched: true, note: `${dimension}: CIDR '${av}' contains ${tv} (${attributeName})`, display: av };
          }
          if (dimension === "destination" && fqdnMatch(av, tv)) {
            return { matched: true, note: `${dimension}: FQDN '${av}' matched '${tv}' (${attributeName})`, display: av };
          }
        }
        if (dimension === "identity" || dimension === "app") {
          const checkTv = tvObj ? String(tvObj.categoryId || tvObj.applicationId || tvObj.protocolId || "") : tv;
          const avL = av.toLowerCase(), tvL = checkTv.toLowerCase();
          if (avL === tvL || avL.includes(tvL) || tvL.includes(avL)) {
            return { matched: true, note: `${dimension}: '${av}' matched '${checkTv}' (${attributeName})`, display: av };
          }
        }
      }

      // "=" with numeric ID for destination object types
      if (dimension === "destination" && (typeof attributeValue === "number" || typeof attributeValue === "string")) {
        const avNum = parseInt(attributeValue, 10);
        if (!isNaN(avNum)) {
          if (an.includes("destination_list") && destinationListId !== null) {
            if (parseInt(destinationListId, 10) === avNum) {
              return { matched: true, note: `${dimension}: destination list ${destinationListId} matched ${attributeName}`, display: resolveDisplayValue(dimension, attributeName, avNum, lookups) };
            }
          }
          if ((an.includes("network_object") || an.includes("networkobject")) && networkObjectId !== null) {
            if (parseInt(networkObjectId, 10) === avNum) {
              return { matched: true, note: `${dimension}: network object ${networkObjectId} matched ${attributeName}`, display: resolveDisplayValue(dimension, attributeName, avNum, lookups) };
            }
          }
          if ((an.includes("service_object") || an.includes("serviceobject")) && serviceObjectGroupId !== null) {
            if (parseInt(serviceObjectGroupId, 10) === avNum) {
              return { matched: true, note: `${dimension}: service object group ${serviceObjectGroupId} matched ${attributeName}`, display: resolveDisplayValue(dimension, attributeName, avNum, lookups) };
            }
          }
          if (an.includes("application_list") && applicationListId !== null) {
            if (parseInt(applicationListId, 10) === avNum) {
              return { matched: true, note: `${dimension}: application list ${applicationListId} matched ${attributeName}`, display: resolveDisplayValue(dimension, attributeName, avNum, lookups) };
            }
          }
          if (an.includes("category_list") && categoryListId !== null) {
            if (parseInt(categoryListId, 10) === avNum) {
              return { matched: true, note: `${dimension}: category list ${categoryListId} matched ${attributeName}`, display: resolveDisplayValue(dimension, attributeName, avNum, lookups) };
            }
          }
        }
      }

      // TODO: unconfirmed — "=" with numeric or boolean non-catch-all attributeValue
      return {
        matched: false,
        note: `${dimension}: no match for '${tv}' against '${JSON.stringify(attributeValue)}' (${attributeName} = ...)`,
      };
    }

    // =========================================================================
    // OPERATOR: "IN"
    // =========================================================================
    if (op === "IN") {

      if (!Array.isArray(attributeValue)) {
        // Malformed — "IN" should always have an array value
        console.warn("[matcher] 'IN' operator with non-array attributeValue:", cond);
        return {
          matched: false,
          note: `${dimension}: malformed IN condition (non-array value) for ${attributeName}`,
        };
      }

      // -----------------------------------------------------------------------
      // CONFIRMED — composite_inline_ip:
      //   attributeName: "umbrella.destination.composite_inline_ip"
      //   attributeOperator: "IN"
      //   attributeValue: [{ ip: string[], port: string[], protocol: string }]
      //
      // Extract all CIDR strings from the ip[] arrays and cidrMatch/fqdnMatch.
      // Port and protocol are noted for visibility but NOT used for matching.
      // -----------------------------------------------------------------------
      if (an.includes("composite_inline_ip")) {
        const { items, cidrs, portProtocolNote } = extractCompositeInlineIp(attributeValue);

        if (items.length === 0) {
          return {
            matched: false,
            note: `${dimension}: composite_inline_ip contained no IP/CIDR entries (${attributeName})`,
          };
        }

        let matchResult;
        for (const item of items) {
          const cidr = item.cidr;
          const ipMatched = cidrMatch(tv, cidr) || (dimension === "destination" && fqdnMatch(cidr, tv));
          
          if (ipMatched) {
            if (portMatch(testPort, item.ports)) {
               matchResult = {
                 matched: true,
                 note: `${dimension}: matched CIDR/FQDN ${cidr} and port ${testPort || 'any'} (${portProtocolNote}) [${attributeName}]`,
                 display: `${cidr} — port ${testPort || 'any'}`,
               };
               break;
            } else {
               // IP matched but port didn't. Keep looping in case another rule item matches both.
               matchResult = {
                 matched: false,
                 note: `${dimension}: IP matched ${cidr} but port ${testPort} excluded by allowed ports [${item.ports.join(",")}] (${portProtocolNote})`
               };
            }
          }
        }

        if (!matchResult) {
          matchResult = {
            matched: false,
            note: `${dimension}: IP '${tv}' did not match any of [${cidrs.join(", ")}] (${portProtocolNote}) [${attributeName}]`,
          };
        }
        return matchResult;
      }

      // -----------------------------------------------------------------------
      // private_resource_ids / private_resource_group_ids, IF the real API
      // turns out to use "IN" rather than "INTERSECT" for this field — the
      // operator actually used here was never confirmed against a live
      // capture (unlike composite_inline_ip/identity_ids/application_ids,
      // which all were), so this branch is a defensive duplicate of the
      // INTERSECT-side handling below rather than a guess at which one is
      // "the" real operator. Whichever it turns out to be, privateResourceId
      // (from the Test Policy form's Private Resource / Resource Group
      // dropdown — see buildTesterPanel() in popup-sections.js) gets tested
      // as a plain membership check against attributeValue, same as the
      // INTERSECT path.
      // -----------------------------------------------------------------------
      if (dimension === "destination" && an.includes("private_resource")) {
        if (privateResourceId === null || privateResourceId === undefined || privateResourceId === "") {
          return {
            matched: false,
            note: `${dimension}: no Private Resource/Group selected for ${attributeName}`,
          };
        }
        const wanted = String(privateResourceId);
        const hit = attributeValue.find((entry) => String(entry) === wanted);
        if (hit !== undefined) {
          return {
            matched: true,
            note: `${dimension}: '${resolveDisplayValue(dimension, attributeName, hit, lookups)}' matched ${attributeName}`,
            display: resolveDisplayValue(dimension, attributeName, hit, lookups),
          };
        }
        return {
          matched: false,
          note: `${dimension}: selected resource not found IN ${attributeName}`,
        };
      }

      // -----------------------------------------------------------------------
      // "IN" with a plain array of scalars (string/number)
      // TODO: unconfirmed — confirm what non-composite IN arrays look like in real rules
      // -----------------------------------------------------------------------
      const matchedEntry = attributeValue.find((entry) => {
        if (typeof entry !== "string" && typeof entry !== "number") return false;
        const ev = String(entry).toLowerCase().trim();
        const tvL = tv.toLowerCase();
        if (dimension === "source" || dimension === "destination") {
          return cidrMatch(tv, String(entry)) || fqdnMatch(String(entry), tv) || ev === tvL;
        }
        return ev === tvL || ev.includes(tvL) || tvL.includes(ev);
      });

      // Identity/app dimensions carry numeric IDs (group tags, branch IDs,
      // category/app IDs) that mean nothing to a human on their own — resolve
      // them to names for the "MATCHED BECAUSE" text. Source/destination
      // values are already human-readable IPs/CIDRs/FQDNs, left as-is.
      const displayValue = (v) =>
        dimension === "identity" || dimension === "app"
          ? resolveDisplayValue(dimension, attributeName, v, lookups)
          : v;

      if (matchedEntry !== undefined) {
        const shown = attributeValue.slice(0, 5).map(displayValue);
        return {
          matched: true,
          note: `${dimension}: value IN [${shown.join(", ")}${attributeValue.length > 5 ? "…" : ""}] matched '${tv}'`,
          display: displayValue(matchedEntry),
        };
      }

      const shown = attributeValue.slice(0, 3).map(displayValue);
      return {
        matched: false,
        note: `${dimension}: '${tv}' not found IN [${shown.join(", ")}${attributeValue.length > 3 ? "…" : ""}] (${attributeName})`,
      };
    }

    // =========================================================================
    // OPERATOR: "INTERSECT"
    // =========================================================================
    if (op === "INTERSECT") {
      if (!Array.isArray(attributeValue)) {
        console.warn("[matcher] 'INTERSECT' operator with non-array attributeValue:", cond);
        return {
          matched: false,
          note: `${dimension}: malformed INTERSECT condition (non-array value) for ${attributeName}`,
        };
      }

      // Parse testInput as comma-separated numeric IDs
      let testIds = [];
      if (dimension === "identity" && an.includes("identity_type")) {
        // identity_type_ids - filter by identity TYPE (e.g., typeId 57 = "Roaming Computers")
        // For now, we don't have a tester field for this, so it won't match
        // unless we add identityTypeId to testInput
        if (testInput && testInput.identityTypeId !== null && testInput.identityTypeId !== undefined && testInput.identityTypeId !== "") {
          testIds.push(parseInt(testInput.identityTypeId, 10));
        }
      } else if (dimension === "destination" && an.includes("private_resource")) {
        // private_resource_ids / private_resource_group_ids
        if (privateResourceId !== null && privateResourceId !== undefined && privateResourceId !== "") {
          testIds.push(parseInt(privateResourceId, 10));
        }
      } else if (dimension === "destination" && an.includes("destination_list")) {
        if (destinationListId !== null && destinationListId !== undefined && destinationListId !== "") {
          testIds.push(parseInt(destinationListId, 10));
        }
      } else if (dimension === "destination" && (an.includes("network_object") || an.includes("networkobject"))) {
        if (networkObjectId !== null && networkObjectId !== undefined && networkObjectId !== "") {
          testIds.push(parseInt(networkObjectId, 10));
        }
      } else if (dimension === "destination" && (an.includes("service_object") || an.includes("serviceobject"))) {
        if (serviceObjectGroupId !== null && serviceObjectGroupId !== undefined && serviceObjectGroupId !== "") {
          testIds.push(parseInt(serviceObjectGroupId, 10));
        }
      } else if (dimension === "destination" && an.includes("application_list")) {
        if (applicationListId !== null && applicationListId !== undefined && applicationListId !== "") {
          testIds.push(parseInt(applicationListId, 10));
        }
      } else if (dimension === "destination" && an.includes("category_list")) {
        if (categoryListId !== null && categoryListId !== undefined && categoryListId !== "") {
          testIds.push(parseInt(categoryListId, 10));
        }
      } else if (tvObj) {
        // NOTE: the category attributeName is NOT universal across orgs/tenants —
        // confirmed variants so far: "umbrella.destination.application_category_ids"
        // (org 8415583) and "umbrella.destination.category_ids" (org 8416432).
        // Both represent the same category-ID INTERSECT match, so match on the
        // "category" substring generically rather than a specific field name.
        if (an.includes("category")) {
          if (tvObj.categoryId !== null) testIds.push(parseInt(tvObj.categoryId, 10));
        } else if (an.includes("application")) {
          // CONFIRMED via live API payload: umbrella.destination.application_ids is
          // the ONLY field used for BOTH "Internet Application" and "Application
          // Protocol" selections — there is no separate protocol_ids field (the
          // dead "protocol" branch that used to sit here has been removed). Both
          // dropdown inputs must be checked against this same condition, since
          // there's no reliable way to tell which "kind" a given ID is without a
          // lookup (see summarizeConditions() in popup-sections.js, which resolves
          // apps-lookup.json first, then falls back to protocols-lookup.json).
          //
          // TODO: unconfirmed — this "application" substring check ALSO catches
          // umbrella.destination.application_list_ids (seen live on org 8176184,
          // "Pseudoco AUP Internet Block", raw ID 20230), a DIFFERENT condition
          // type from application_ids. Testing it via applicationId/protocolId
          // is very likely wrong (that field probably references a named
          // "application list" object, not a single app/protocol ID directly —
          // same idea as private_resource_group_ids referencing a group rather
          // than an individual resource), so a rule that depends on this
          // condition will currently never match through the tester, even with
          // an Internet Application/Protocol value filled in. Needs its own
          // confirmed endpoint/lookup and a dedicated branch here once that
          // shape is known, rather than falling through to applicationId/
          // protocolId matching by accident.
          if (tvObj.applicationId !== null) testIds.push(parseInt(tvObj.applicationId, 10));
          if (tvObj.protocolId !== null) testIds.push(parseInt(tvObj.protocolId, 10));
        }
      } else {
        testIds = tv.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      }
      
      if (testIds.length === 0) {
        return {
          matched: false,
          note: `${dimension}: test input contained no valid numeric IDs for INTERSECT (${attributeName})`,
        };
      }

      // Match if there is ANY overlap
      const overlap = testIds.find((id) => attributeValue.includes(id));

      if (overlap !== undefined) {
        return {
          matched: true,
          note: `${dimension}: '${resolveDisplayValue(dimension, attributeName, overlap, lookups)}' matched ${attributeName}`,
          display: resolveDisplayValue(dimension, attributeName, overlap, lookups),
        };
      }

      const shownIds = attributeValue.slice(0, 5).map((id) => resolveDisplayValue(dimension, attributeName, id, lookups));
      return {
        matched: false,
        note: `${dimension}: no overlap with ${attributeName} [${shownIds.join(", ")}${attributeValue.length > 5 ? "…" : ""}]`,
      };
    }

    // =========================================================================
    // UNCONFIRMED OPERATORS
    // =========================================================================

    // TODO: unconfirmed operator "NOT IN" — invert the IN logic above
    // TODO: unconfirmed operator "CONTAINS" — substring / prefix match
    // TODO: unconfirmed operator "BETWEEN" — range match (e.g. port ranges)
    // TODO: unconfirmed operator "!=" — negation of "="

    console.warn("[matcher] Unrecognised attributeOperator:", op, "on condition:", cond);
    return {
      matched: false,
      note: `${dimension}: unrecognised operator '${op}' — cannot evaluate (${attributeName})`,
    };
  }

  // ---------------------------------------------------------------------------
  // matchesRule — REAL SCHEMA version
  // ---------------------------------------------------------------------------

  /**
   * Returns whether `rule` matches `testInput` and which conditions matched.
   *
   * Real API fields used:
   *   rule.ruleIsEnabled  — boolean (fallback: rule.enabled for mock)
   *   rule.ruleConditions — array of { attributeName, attributeOperator, attributeValue }
   *   rule.ruleAction     — string  (display only here)
   *   rule.rulePriority   — number  (used by matchPolicy for sort)
   *
   * Blank-field semantics:
   *   A blank tester field matches ONLY if the rule's own condition for that
   *   dimension is unconstrained (i.e. empty or a `.all` catch-all).
   *   If a rule has a specific constraint on a dimension, a blank test field
   *   for that dimension will FAIL the rule match.
   *   At least one field must be filled (enforced upstream in the form).
   *
   * AND semantics within a dimension:
   *   ALL conditions for a given dimension must pass.
   *   If a dimension has zero conditions it is treated as unrestricted.
   *
   * @param {object} rule
   * @param {{ source: string, identity: string, app: string, destination: string, privateResourceId?: string|number|null }} testInput
   * @param {{ identities?: object, categories?: object, apps?: object, protocols?: object }} [lookups]
   *   Optional — when provided, identity/app-dimension IDs in the returned
   *   matchedConditions notes are resolved to names instead of shown raw
   *   (see resolveDisplayValue() above). Omitting it just falls back to raw
   *   IDs, same as an unresolved ID would show.
   * @returns {{ matched: boolean, matchedConditions: string[] }}
   */
  function matchesRule(rule, testInput, lookups = {}) {
    const isEnabled = rule.ruleIsEnabled !== undefined ? rule.ruleIsEnabled : rule.enabled;
    if (isEnabled === false) {
      return {
        matched: false,
        matchedConditions: ["rule is disabled — skipped"],
        matchFields: null,
      };
    }

    const { 
      source = "", 
      sourcePort = null, 
      identity = "", 
      identityTypeId = null,
      categoryId = null, 
      applicationId = null, 
      protocolId = null, 
      destination = "", 
      destinationPort = null, 
      privateResourceId = null,
      destinationListId = null,
      networkObjectId = null,
      serviceObjectGroupId = null,
      applicationListId = null,
      categoryListId = null,
    } = testInput;
    const hasSource      = source.trim()      !== "";
    const hasIdentity    = identity.trim()    !== "" || (identityTypeId !== null && identityTypeId !== "");
    const hasApp         = categoryId !== null || applicationId !== null || protocolId !== null;
    const hasDestination = destination.trim() !== "" || 
                          (privateResourceId !== null && privateResourceId !== "") ||
                          (destinationListId !== null && destinationListId !== "") ||
                          (networkObjectId !== null && networkObjectId !== "") ||
                          (serviceObjectGroupId !== null && serviceObjectGroupId !== "") ||
                          (applicationListId !== null && applicationListId !== "") ||
                          (categoryListId !== null && categoryListId !== "");

    const matchedConditions = [];
    // Structured, presentation-ready version of the same info as
    // matchedConditions (which stays as freeform text for backward compat —
    // content-script.js's hover popover still consumes it directly). This is
    // what the redesigned clean field-grid result panel renders instead of
    // parsing/guessing structure out of the "→ dimension: ..." text lines.
    const matchFields = {
      source:      { label: "Source",      constrained: false, display: "Any" },
      identity:    { label: "Identity",    constrained: false, display: "Any" },
      destination: { label: "Destination", constrained: false, display: "Any" },
      app:         { label: "App / Category / Protocol", constrained: false, display: "Any" },
    };

    // Partition ruleConditions into dimension buckets
    const conditions = rule.ruleConditions || rule.conditions || [];
    const byDim = { source: [], destination: [], identity: [], app: [], unknown: [] };
    for (const cond of conditions) {
      const dim = conditionDimension(cond.attributeName);
      byDim[dim].push(cond);
    }

    // Helper: returns true if the dimension array contains any non-catch-all condition
    function hasSpecificConditions(conds) {
      return conds.some((c) => !(c.attributeValue === true && c.attributeName.toLowerCase().endsWith(".all")));
    }

    const NO_MATCH = { matched: false, matchedConditions: [], matchFields: null };

    // ------------------------------------------------------------------
    // Source dimension
    // ------------------------------------------------------------------
    if (hasSource) {
      const srcConds = byDim.source;
      if (srcConds.length === 0) {
        matchedConditions.push("source: no source conditions on rule (unrestricted)");
      } else {
        const displays = [];
        for (const cond of srcConds) {
          const result = matchConditionValue(cond, "source", source, sourcePort, lookups);
          if (!result.matched) return NO_MATCH;
          matchedConditions.push(result.note);
          if (result.display) displays.push(result.display);
        }
        if (displays.length) {
          matchFields.source = { label: "Source", constrained: true, display: displays.join(", ") };
        }
      }
    } else {
      if (hasSpecificConditions(byDim.source)) return NO_MATCH;
      matchedConditions.push("source: not constrained (field blank, rule has no specific conditions)");
    }

    // ------------------------------------------------------------------
    // Identity dimension
    // ------------------------------------------------------------------
    if (hasIdentity) {
      const idConds = byDim.identity;
      if (idConds.length === 0) {
        // No dedicated identity conditions — check if source is catch-all
        const anySourceCatchAll = byDim.source.some(
          (c) => c.attributeValue === true && c.attributeName.toLowerCase().endsWith(".all")
        );
        if (byDim.source.length === 0 || anySourceCatchAll) {
          matchedConditions.push("identity: no identity conditions on rule (unrestricted via source catch-all)");
        } else {
          return NO_MATCH;
        }
      } else {
        const displays = [];
        for (const cond of idConds) {
          const result = matchConditionValue(cond, "identity", identity, null, lookups);
          if (!result.matched) return NO_MATCH;
          matchedConditions.push(result.note);
          if (result.display) displays.push(result.display);
        }
        if (displays.length) {
          matchFields.identity = { label: "Identity", constrained: true, display: displays.join(", ") };
        }
      }
    } else {
      if (hasSpecificConditions(byDim.identity)) return NO_MATCH;
      matchedConditions.push("identity: not constrained (field blank, rule has no specific conditions)");
    }

    // ------------------------------------------------------------------
    // Destination dimension
    // ------------------------------------------------------------------
    if (hasDestination) {
      const dstConds = byDim.destination;
      if (dstConds.length === 0) {
        matchedConditions.push("destination: no destination conditions on rule (unrestricted)");
      } else {
        const displays = [];
        for (const cond of dstConds) {
          const testInputObj = { privateResourceId, destinationListId, networkObjectId, serviceObjectGroupId, applicationListId, categoryListId };
          const result = matchConditionValue(cond, "destination", destination, destinationPort, lookups, testInputObj);
          if (!result.matched) return NO_MATCH;
          matchedConditions.push(result.note);
          if (result.display) displays.push(result.display);
        }
        if (displays.length) {
          matchFields.destination = { label: "Destination", constrained: true, display: displays.join(", ") };
        }
      }
    } else {
      if (hasSpecificConditions(byDim.destination)) return NO_MATCH;
      matchedConditions.push("destination: not constrained (field blank, rule has no specific conditions)");
    }

    // ------------------------------------------------------------------
    // App dimension
    // ------------------------------------------------------------------
    if (hasApp) {
      const appConds = byDim.app;
      if (appConds.length === 0) {
        matchedConditions.push("app: no app conditions on rule (unrestricted)");
      } else {
        const displays = [];
        for (const cond of appConds) {
          const testValObj = { categoryId, applicationId, protocolId };
          const result = matchConditionValue(cond, "app", testValObj, null, lookups);
          if (!result.matched) return NO_MATCH;
          matchedConditions.push(result.note);
          if (result.display) displays.push(result.display);
        }
        if (displays.length) {
          matchFields.app = { label: "App / Category / Protocol", constrained: true, display: displays.join(", ") };
        }
      }
    } else {
      if (hasSpecificConditions(byDim.app)) return NO_MATCH;
      matchedConditions.push("app: not constrained (field blank, rule has no specific conditions)");
    }

    if (byDim.unknown && byDim.unknown.length > 0) {
      if (hasSpecificConditions(byDim.unknown)) return NO_MATCH;
    }

    return { matched: true, matchedConditions, matchFields };
  }

  // ---------------------------------------------------------------------------
  // matchPolicy — first-match-wins walk sorted by rulePriority ascending
  // ---------------------------------------------------------------------------

  /**
   * Sort rules by rulePriority ascending (fallback: rule.order for mock).
   * Lower number = evaluated first (standard firewall priority convention).
   *
   * Default/catch-all rules (ruleIsDefault / is_default) always sort LAST
   * regardless of their rulePriority value — they're only meant to apply
   * when no custom rule matched, which is a policy invariant independent of
   * whatever priority number the API assigns them (unconfirmed whether that
   * number is even meaningful for default rules).
   *
   * Returns the first rule that matches testInput, or null.
   *
   * @param {object[]} rules
   * @param {{ source: string, identity: string, app: string, destination: string, privateResourceId?: string|number|null }} testInput
   * @param {{ identities?: object, categories?: object, apps?: object, protocols?: object }} [lookups]
   *   Optional — forwarded to matchesRule() so matchedConditions notes show
   *   resolved names instead of raw IDs. See resolveDisplayValue() above.
   * @returns {{ rule: object, matchedConditions: string[], matchFields: object } | null}
   */
  function matchPolicy(rules, testInput, lookups = {}) {
    const sorted = [...rules].sort((a, b) => {
      const aDefault = (a.ruleIsDefault !== undefined ? a.ruleIsDefault : a.is_default) === true;
      const bDefault = (b.ruleIsDefault !== undefined ? b.ruleIsDefault : b.is_default) === true;
      if (aDefault !== bDefault) return aDefault ? 1 : -1;

      const pa = a.rulePriority !== undefined ? a.rulePriority : a.order;
      const pb = b.rulePriority !== undefined ? b.rulePriority : b.order;
      return pa - pb;
    });

    for (const rule of sorted) {
      const result = matchesRule(rule, testInput, lookups);
      if (result.matched) {
        return { rule, matchedConditions: result.matchedConditions, matchFields: result.matchFields };
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // getCleanRules — rules with zero findings across all 6 checks
  // ---------------------------------------------------------------------------

  /**
   * Return rules not referenced by any finding.
   * Uses String() coercion so numeric ruleId 2741542 === string "2741542".
   *
   * @param {object[]} rules
   * @param {object[]} findings
   * @returns {object[]}
   */
  function getCleanRules(rules, findings) {
    const dirtyIds = new Set(findings.map((f) => String(f.ruleId)));
    return rules.filter((r) => {
      const rid = r.ruleId !== undefined ? String(r.ruleId) : String(r.id);
      return !dirtyIds.has(rid);
    });
  }

  // ---------------------------------------------------------------------------
  // getIdentityOptions — unique identity values for the combobox datalist
  // ---------------------------------------------------------------------------

  /**
   * Scan ruleConditions for identity-dimension attributes and collect values.
   * Falls back to rule.sources[] prefix scan for mock schema rules.
   *
   * @param {object[]} rules
   * @returns {string[]}
   */
  function getIdentityOptions(rules) {
    const seen = new Set();
    for (const rule of rules) {
      if (Array.isArray(rule.ruleConditions || rule.conditions)) {
        for (const cond of (rule.ruleConditions || rule.conditions)) {
          if (conditionDimension(cond.attributeName) === "identity") {
            if (typeof cond.attributeValue === "string" && cond.attributeValue) {
              seen.add(cond.attributeValue);
            }
            if (typeof cond.attributeValue === "number" && cond.attributeValue) {
              seen.add(String(cond.attributeValue));
            }
            if (Array.isArray(cond.attributeValue)) {
              for (const v of cond.attributeValue) {
                if (typeof v === "string" && v) seen.add(v);
                if (typeof v === "number" && v) seen.add(String(v));
              }
            }
          }
        }
        continue;
      }
      // MOCK_SCHEMA_LEGACY fallback
      const mockPrefixes = ["group:", "user:", "network:", "site:"];
      for (const src of rule.sources || []) {
        if (mockPrefixes.some((p) => src.toLowerCase().startsWith(p))) seen.add(src);
      }
    }
    return [...seen].sort();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================
  //
  // The mock-schema matching helpers that used to live here
  // (identityMatch/appMatch/matchSourceEntry/matchDestEntry/matchesRule, all
  // suffixed _LEGACY and exposed only as window.Matcher._legacy.* "for
  // reference during real API integration") were never called by the
  // primary matchesRule()/matchPolicy() path and had no other callers
  // anywhere in the extension — removed now that the real API schema is
  // fully confirmed and implemented above, instead of keeping ~100 lines of
  // provably-dead code around indefinitely.

  global.Matcher = {
    // Low-level helpers (schema-independent)
    cidrMatch,
    fqdnMatch,
    conditionDimension,
    extractCompositeInlineIp,   // exposed for unit testing

    // Primary API — REAL schema
    matchesRule,
    matchPolicy,
    getCleanRules,
    getIdentityOptions,
  };
})(window);
