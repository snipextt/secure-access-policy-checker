(function (root) {
  "use strict";

  function create(container, catalogs, onRun, onReset, onHighlight) {
    let activeCatalogs = catalogs || {};
    const model = root.TrafficPath;
    const node = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const panel = node("section", "tp-panel");
    panel.id = "tp-panel";
    const header = node("header", "tp-header");
    header.append(node("h1", "tp-title", "Policy check"));
    const reset = node("button", "tp-reset", "Reset");
    reset.type = "button";
    reset.setAttribute("aria-label", "Reset policy check");
    reset.title = "Reset";
    header.append(reset);
    panel.append(header);

    const form = node("div", "tp-form");
    const destinationLabel = node("label", "tp-label", "Destination");
    destinationLabel.htmlFor = "tp-destination";
    const destination = node("input", "tp-input");
    destination.id = "tp-destination";
    destination.placeholder = "domain.com or https://domain.com/path";
    destination.autocomplete = "off";
    form.append(destinationLabel, destination);

    const controls = node("div", "tp-controls");
    const pathField = node("div", "tp-field tp-path-field");
    const pathLabel = node("label", "tp-label", "Connection");
    pathLabel.htmlFor = "tp-path";
    const pathSelect = node("select", "tp-input");
    pathSelect.id = "tp-path";
    const emptyPath = node("option", "", "Select a traffic path");
    emptyPath.value = "";
    pathSelect.append(emptyPath);
    let path = "";
    let sourceKind = "";
    let requestVersion = 0;
    let runToken = 0;
    function invalidateResult() {
      requestVersion++;
      results.replaceChildren();
    }
    Object.entries(model.PATHS).forEach(([key, config]) => {
      const option = node("option", "", config.label);
      option.value = key;
      pathSelect.append(option);
    });
    pathSelect.addEventListener("change", () => {
      path = pathSelect.value;
      sourceKind = "";
      invalidateResult();
      renderSourceOptions();
      error.textContent = "";
      persist();
    });
    pathField.append(pathLabel, pathSelect);

    const sourceField = node("div", "tp-field tp-source-field");
    const sourceLabel = node("label", "tp-label", "Identity");
    sourceLabel.htmlFor = "tp-source-catalog";
    const sourceSelect = node("select", "tp-input");
    sourceSelect.id = "tp-source-catalog";
    const sourceIp = node("input", "tp-input");
    sourceIp.id = "tp-source-ip";
    sourceIp.placeholder = "Client IPv4 address (one host)";
    sourceIp.autocomplete = "off";
    const sourceHint = node("p", "tp-hint");
    const trafficField = node("div", "tp-field tp-traffic-field");
    const trafficLabel = node("label", "tp-label", "Traffic type");
    trafficLabel.htmlFor = "tp-traffic-kind";
    const trafficSelect = node("select", "tp-input");
    trafficSelect.id = "tp-traffic-kind";
    Object.entries(model.TRAFFIC_KINDS).forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      trafficSelect.append(option);
    });
    trafficField.append(trafficLabel, trafficSelect);
    const scopeLabel = node("label", "tp-label", "Destination scope");
    scopeLabel.htmlFor = "tp-scope";
    const scope = node("select", "tp-input");
    scope.id = "tp-scope";
    [["", "Infer from destination"], ["public_internet", "Internet"], ["private_network", "Private Access"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      scope.append(option);
    });
    sourceField.append(sourceLabel, sourceSelect, sourceIp, sourceHint);
    controls.append(pathField, sourceField);
    const scopeField = node("div", "tp-field tp-scope-field");
    scopeField.append(scopeLabel, scope);
    const routingField = node("div", "tp-field tp-routing-field");
    const routingLabel = node("label", "tp-label", "Web routing to SWG");
    routingLabel.htmlFor = "tp-web-steering";
    const routingSelect = node("select", "tp-input");
    routingSelect.id = "tp-web-steering";
    [["unknown", "Not sure"], ["yes", "Enabled"], ["no", "Not enabled"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      routingSelect.append(option);
    });
    routingField.append(routingLabel, routingSelect);
    form.append(controls);
    const advanced = node("details", "tp-advanced");
    advanced.append(node("summary", "", "More options"));
    const advancedFields = node("div", "tp-advanced-fields");
    advancedFields.append(trafficField, scopeField, routingField);
    advanced.append(advancedFields);
    form.append(advanced);

    function renderSourceOptions(savedValue) {
      sourceSelect.replaceChildren();
      const placeholder = node("option", "", "Choose an identity");
      placeholder.value = "";
      sourceSelect.append(placeholder);
      for (const kind of path ? model.PATHS[path].sources : []) {
        const type = model.SOURCES[kind];
        if (kind === "internalIp") {
          const option = node("option", "", "Internal client IPv4");
          option.value = "internalIp:";
          sourceSelect.append(option);
          continue;
        }
        const items = activeCatalogs[type.catalog];
        if (!items || !Object.keys(items).length) continue;
        const group = node("optgroup", "");
        group.label = type.label;
        Object.entries(items).sort((a, b) => String(a[1].name || a[1].label || a[1]).localeCompare(String(b[1].name || b[1].label || b[1]))).forEach(([id, item]) => {
          const label = typeof item === "string" ? item : item.name || item.label || item.displayName || String(id);
          const option = node("option", "", label);
          option.value = `${kind}:${id}`;
          group.append(option);
        });
        sourceSelect.append(group);
      }
      sourceSelect.disabled = !path;
      sourceSelect.value = sourceKind ? `${sourceKind}:${sourceKind === "internalIp" ? "" : savedValue || ""}` : "";
      sourceIp.hidden = sourceKind !== "internalIp";
      sourceHint.textContent = path && sourceSelect.options.length === 1 ? "No identities loaded. Refresh the dashboard." : "";
    }
    sourceSelect.addEventListener("change", () => {
      sourceKind = sourceSelect.value.split(":")[0];
      sourceIp.value = "";
      sourceIp.hidden = sourceKind !== "internalIp";
      invalidateResult();
      persist();
    });

    const error = node("p", "tp-error");
    error.id = "tp-error";
    error.setAttribute("role", "alert");
    const actions = node("div", "tp-actions");
    const run = node("button", "tp-primary", "Check policy →");
    run.type = "button";
    actions.append(run);
    form.append(error, actions);
    panel.append(form);
    const results = node("section", "tp-results");
    results.id = "tp-results";
    results.setAttribute("aria-live", "polite");
    panel.append(results);
    container.append(panel);

    const draftKey = "psc-traffic-path-draft";
    function persist() {
      const draft = { destination: destination.value, path, sourceKind, sourceValue: sourceKind === "internalIp" ? sourceIp.value : sourceSelect.value.slice(sourceKind.length + 1), scope: scope.value, trafficKind: trafficSelect.value, webSteering: routingSelect.value };
      try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch (_) {}
    }
    for (const control of [destination, sourceSelect, sourceIp, scope, trafficSelect, routingSelect]) {
      control.addEventListener("input", () => { invalidateResult(); persist(); });
      control.addEventListener("change", () => { invalidateResult(); persist(); });
    }
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "{}");
      destination.value = draft.destination || "";
      scope.value = draft.scope || "";
      trafficSelect.value = model.TRAFFIC_KINDS[draft.trafficKind] ? draft.trafficKind : "auto";
      routingSelect.value = ["unknown", "yes", "no"].includes(draft.webSteering) ? draft.webSteering : "unknown";
      if (model.PATHS[draft.path]) {
        path = draft.path;
        pathSelect.value = path;
        if (model.PATHS[path].sources.includes(draft.sourceKind)) sourceKind = draft.sourceKind;
        if (sourceKind === "internalIp") sourceIp.value = draft.sourceValue || "";
        renderSourceOptions(draft.sourceValue);
      } else renderSourceOptions();
    } catch (_) { renderSourceOptions(); }

    function renderResult(payload) {
      results.replaceChildren();
      if (!payload) return;
      const stages = payload.stages || [];
      const flow = node("section", "tp-stage-results");
      flow.append(node("h2", "tp-section-label", "Policy path"));
      const seenRules = new Map();
      for (const { stage, state, match, conditional, dnsUnresolved } of stages) {
        const row = node("div", `tp-stage tp-stage-${state}`);
        const stageName = node("span", "tp-stage-name", stage.label);
        if (stage.certainty === "possible") stageName.append(node("small", "tp-stage-qualifier", "Possible"));
        row.append(stageName);
        const content = node("div", "tp-stage-copy");
        if (state === "matched") {
          const rule = match.rule;
          const layer = model.policyLayer(match);
          const ruleId = rule.ruleId ?? rule.id ?? "—";
          const ruleName = rule.ruleName || rule.name || "Unnamed rule";
          content.append(node("span", "tp-stage-kicker", "RULE ACTION"),
            node("strong", `tp-stage-action tp-stage-action-${layer.status}`, layer.action),
            node("p", "tp-stage-rule", `${ruleName} · Rule ${ruleId}`));
          if (seenRules.has(String(ruleId))) content.append(node("p", "tp-stage-note", `Same rule as ${seenRules.get(String(ruleId))}`));
          else seenRules.set(String(ruleId), stage.label);
          if (conditional) content.append(node("p", "tp-stage-note", dnsUnresolved ? "If DNS permits and this request reaches SWG" : "If this request reaches SWG"));
          const profileId = stage.key === "web" && model.webProfile(rule);
          if (profileId) content.append(node("p", "tp-stage-note", `Web security profile ${profileId} attached; its controls may change the event outcome.`));
          const jump = node("button", "tp-link", "View rule ↗");
          jump.type = "button";
          jump.addEventListener("click", () => onHighlight(match));
          content.append(jump);
        } else {
          const messages = {
            "needs-context": ["Needs destination context", "A higher rule needs application, category, or traffic-port information."],
            "not-reached": ["Not reached", "DNS matches a blocking rule."],
            "not-routed": ["Not routed to SWG", "Web security is not enabled for this scenario."],
            "needs-routing": ["Web routing needed", "This port is not covered by the standard 80/443 SWG path."],
            "no-match": ["No matching rule", "No loaded access rule matched this stage."],
          };
          const [title, detail] = messages[state] || ["Needs more context", "This stage could not be evaluated."];
          content.append(node("strong", "tp-stage-action", title), node("p", "tp-stage-note", detail));
        }
        row.append(content);
        flow.append(row);
      }
      results.append(flow);
      const report = node("details", "tp-report");
      report.append(node("summary", "", "Why this result"));
      const body = node("div", "tp-report-body");
      if (payload.note) body.append(node("p", "", payload.note));
      body.append(node("p", "", `${model.PATHS[path].label} · ${payload.input.destination} · ${payload.input.destinationScope || "Internet"}`));
      for (const { stage, state, match } of stages) {
        if (state !== "matched" && state !== "needs-context") continue;
        body.append(node("strong", "", stage.label));
        if (state === "needs-context") body.append(node("p", "", match.reason));
        else (match.matchedConditions || []).forEach(condition => body.append(node("p", "", String(condition))));
      }
      report.append(body);
      results.append(report);
    }

    run.addEventListener("click", async () => {
      const sourceValue = sourceKind === "internalIp" ? sourceIp.value : sourceSelect.value.slice(sourceKind.length + 1);
      const prepared = model.buildInput({ path, sourceKind, sourceValue, destination: destination.value, scope: scope.value, trafficKind: trafficSelect.value, webSteering: routingSelect.value }, activeCatalogs);
      if (prepared.error) { error.textContent = prepared.error; if (/scope|Choose Web|traffic type/i.test(prepared.error)) advanced.open = true; return; }
      error.textContent = "";
      const version = ++requestVersion;
      const token = ++runToken;
      run.disabled = true;
      run.textContent = "Checking…";
      try {
        const evaluated = await onRun(prepared, path);
        if (version === requestVersion) renderResult({ stages: evaluated, input: prepared.testInput, scenario: prepared.scenario, note: prepared.note });
      } catch (cause) {
        if (version === requestVersion) error.textContent = `Could not check policies: ${cause.message || cause}`;
      } finally {
        if (token === runToken) {
          run.disabled = false;
          run.textContent = "Check policy →";
        }
      }
    });
    reset.addEventListener("click", () => {
      destination.value = "";
      path = "";
      pathSelect.value = "";
      trafficSelect.value = "auto";
      routingSelect.value = "unknown";
      sourceKind = "";
      sourceIp.value = "";
      scope.value = "";
      renderSourceOptions();
      invalidateResult();
      error.textContent = "";
      try { sessionStorage.removeItem(draftKey); } catch (_) {}
      onReset();
    });
    function updateCatalogs(nextCatalogs) {
      activeCatalogs = nextCatalogs || {};
      let selected = sourceKind === "internalIp" ? "" : sourceSelect.value.slice(sourceKind.length + 1);
      if (!selected) {
        try { selected = JSON.parse(sessionStorage.getItem(draftKey) || "{}").sourceValue || ""; } catch (_) {}
      }
      renderSourceOptions(selected);
    }
    return { panel, updateResult: renderResult, updateCatalogs };
  }

  root.TrafficPathPanel = { create };
})(window);
