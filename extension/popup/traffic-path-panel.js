(function (root) {
  "use strict";

  function create(container, catalogs, onRun, onReset, onHighlight) {
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
    header.append(node("div", "tp-eyebrow", "SECURE ACCESS  /  POLICY CHECK"),
      node("h1", "tp-title", "Check a policy"),
      node("p", "tp-intro", "See which access rule matches—and what still needs verification."));
    panel.append(header);

    const form = node("div", "tp-form");
    const destinationLabel = node("label", "tp-label", "Destination");
    destinationLabel.htmlFor = "tp-destination";
    const destination = node("input", "tp-input");
    destination.id = "tp-destination";
    destination.placeholder = "Domain, URL or IPv4 address";
    destination.autocomplete = "off";
    form.append(destinationLabel, destination, node("p", "tp-hint", "URLs are checked by host; paths and queries are not evaluated."));

    const controls = node("div", "tp-controls");
    const pathField = node("div", "tp-field tp-path-field");
    const pathLabel = node("label", "tp-label", "Traffic path");
    pathLabel.htmlFor = "tp-path";
    const pathSelect = node("select", "tp-input");
    pathSelect.id = "tp-path";
    const emptyPath = node("option", "", "Select a traffic path");
    emptyPath.value = "";
    pathSelect.append(emptyPath);
    let path = "";
    let sourceKind = "";
    let requestVersion = 0;
    function invalidateResult() {
      requestVersion++;
      results.replaceChildren();
    }
    Object.entries(model.PATHS).forEach(([key, config]) => {
      const option = node("option", "", config.label);
      option.value = key;
      pathSelect.append(option);
    });
    const pathDescription = node("p", "tp-hint");
    pathSelect.addEventListener("change", () => {
      path = pathSelect.value;
      sourceKind = "";
      invalidateResult();
      renderSourceOptions();
      error.textContent = "";
      persist();
    });
    pathField.append(pathLabel, pathSelect, pathDescription);

    const sourceField = node("div", "tp-field tp-source-field");
    const sourceLabel = node("label", "tp-label", "Source");
    sourceLabel.htmlFor = "tp-source-kind";
    const sourceKindSelect = node("select", "tp-input");
    sourceKindSelect.id = "tp-source-kind";
    const sourceSelect = node("select", "tp-input");
    sourceSelect.id = "tp-source-catalog";
    const sourceIp = node("input", "tp-input");
    sourceIp.id = "tp-source-ip";
    sourceIp.placeholder = "Client IPv4 address (one host)";
    sourceIp.autocomplete = "off";
    const sourceHint = node("p", "tp-hint");
    const scopeLabel = node("label", "tp-label", "Destination scope");
    scopeLabel.htmlFor = "tp-scope";
    const scope = node("select", "tp-input");
    scope.id = "tp-scope";
    [["", "Infer from destination"], ["public_internet", "Internet"], ["private_network", "Private Access"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      scope.append(option);
    });
    sourceField.append(sourceLabel, sourceKindSelect, sourceSelect, sourceIp, sourceHint);
    controls.append(sourceField, pathField);
    const scopeField = node("div", "tp-scope-field");
    scopeField.append(scopeLabel, scope, node("p", "tp-hint", "Required for IP destinations. Domains default to Internet."));
    form.append(controls, scopeField);

    function renderCatalog(savedValue) {
      const type = model.SOURCES[sourceKind];
      const isIp = sourceKind === "internalIp";
      sourceIp.hidden = !isIp;
      sourceSelect.hidden = isIp || !type;
      sourceHint.textContent = "";
      if (isIp || !type) return;
      sourceSelect.replaceChildren();
      const placeholder = node("option", "", `Select ${type.label.toLowerCase()}`);
      placeholder.value = "";
      sourceSelect.append(placeholder);
      const items = catalogs && catalogs[type.catalog];
      const entries = items && typeof items === "object" ? Object.entries(items) : [];
      entries.sort((a, b) => String(a[1].name || a[1].label || a[1]).localeCompare(String(b[1].name || b[1].label || b[1])));
      entries.forEach(([id, item]) => {
        const label = typeof item === "string" ? item : item.name || item.label || item.displayName || String(id);
        const option = node("option", "", label);
        option.value = id;
        sourceSelect.append(option);
      });
      if (!entries.length) {
        sourceHint.textContent = items ? "No entries in this catalog." : "Catalog not loaded yet. Refresh the dashboard to fetch it.";
        sourceSelect.disabled = true;
      } else {
        sourceSelect.disabled = false;
        if (savedValue && Object.prototype.hasOwnProperty.call(items, savedValue)) sourceSelect.value = savedValue;
      }
    }

    function renderSourceOptions(savedValue) {
      pathDescription.textContent = path ? model.PATHS[path].description : "Select a traffic path to see available source identities.";
      sourceKindSelect.replaceChildren();
      const placeholder = node("option", "", "Choose a source type");
      placeholder.value = "";
      sourceKindSelect.append(placeholder);
      (path ? model.PATHS[path].sources : []).forEach(kind => {
        const option = node("option", "", model.SOURCES[kind].label);
        option.value = kind;
        sourceKindSelect.append(option);
      });
      sourceKindSelect.disabled = !path;
      sourceKindSelect.value = sourceKind || "";
      renderCatalog(savedValue);
    }
    sourceKindSelect.addEventListener("change", () => {
      sourceKind = sourceKindSelect.value;
      sourceIp.value = "";
      invalidateResult();
      renderCatalog();
      persist();
    });

    const error = node("p", "tp-error");
    error.id = "tp-error";
    error.setAttribute("role", "alert");
    const actions = node("div", "tp-actions");
    const reset = node("button", "tp-secondary", "Reset");
    reset.type = "button";
    const run = node("button", "tp-primary", "Check policy");
    run.type = "button";
    actions.append(reset, run);
    form.append(error, actions);
    panel.append(form);
    const results = node("section", "tp-results");
    results.id = "tp-results";
    results.setAttribute("aria-live", "polite");
    panel.append(results);
    container.append(panel);

    const draftKey = "psc-traffic-path-draft";
    function persist() {
      const draft = { destination: destination.value, path, sourceKind, sourceValue: sourceKind === "internalIp" ? sourceIp.value : sourceSelect.value, scope: scope.value };
      try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch (_) {}
    }
    for (const control of [destination, sourceSelect, sourceIp, scope]) {
      control.addEventListener("input", () => { invalidateResult(); persist(); });
      control.addEventListener("change", () => { invalidateResult(); persist(); });
    }
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "{}");
      destination.value = draft.destination || "";
      scope.value = draft.scope || "";
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
      const { match, note } = payload;
      const matched = Boolean(match && !match.noMatch && match.rule);
      const summary = node("div", `tp-summary ${matched ? "tp-summary-match" : "tp-summary-unresolved"}`);
      const summaryText = node("div", "tp-summary-copy");
      summaryText.append(node("div", "tp-eyebrow", "POLICY CHECK RESULT"),
        node("strong", "tp-summary-title", matched ? "Access-rule candidate found" : "No rule confirmed"),
        node("p", "tp-summary-note", matched
          ? "Rule conditions match. Traffic-path and layer outcomes still need verification."
          : "No access rule matched the loaded data. This does not mean traffic is allowed or blocked."));
      summary.append(node("span", "tp-summary-mark", matched ? "◇" : "?"), summaryText);
      results.append(summary);
      if (note) results.append(node("p", "tp-hint tp-url-note", note));
      if (matched) {
        const rule = match.rule;
        const card = node("div", "tp-match");
        const details = node("div", "tp-match-copy");
        details.append(node("span", "tp-match-label", "Matched access rule"),
          node("strong", "tp-match-name", rule.ruleName || rule.name || "Unnamed rule"),
          node("span", "tp-match-action", `${String(rule.ruleAction || rule.action || "Unknown").toUpperCase()} · Priority ${rule.rulePriority ?? rule.order ?? "?"}`));
        const jump = node("button", "tp-link", "View on policy page ↗");
        jump.type = "button";
        jump.addEventListener("click", () => onHighlight(match));
        card.append(details, jump);
        results.append(card);
      }
      results.append(node("div", "tp-section-label", "POLICY LAYERS"));
      const layers = node("ol", "tp-layers");
      model.layerSummary(path, match).forEach((layer, index) => {
        const row = node("li", `tp-layer tp-layer-${layer.status}`);
        const indicator = node("span", "tp-layer-number", String(index + 1).padStart(2, "0"));
        const copy = node("div", "tp-layer-copy");
        const title = node("div", "tp-layer-top");
        title.append(node("strong", "", layer.label), node("span", "tp-layer-state", layer.status.replace("-", " ")));
        copy.append(title, node("p", "", layer.detail));
        row.append(indicator, copy);
        layers.append(row);
      });
      results.append(layers);
      const report = node("details", "tp-report");
      report.append(node("summary", "", "Full evaluation report"));
      report.append(node("p", "", `Path: ${model.PATHS[path].label} · Destination: ${payload.input.destination} · Scope: ${payload.input.destinationScope || "inferred from domain"}.`));
      if (match && !match.noMatch) {
        (match.matchedConditions || []).forEach(condition => report.append(node("p", "", String(condition))));
      } else {
        (match && match.rejected || []).slice(0, 8).forEach(rejection => {
          report.append(node("p", "", `${rejection.ruleName}: ${rejection.reason}`));
        });
      }
      results.append(report);
    }

    run.addEventListener("click", async () => {
      const sourceValue = sourceKind === "internalIp" ? sourceIp.value : sourceSelect.value;
      const prepared = model.buildInput({ path, sourceKind, sourceValue, destination: destination.value, scope: scope.value }, catalogs);
      if (prepared.error) { error.textContent = prepared.error; return; }
      error.textContent = "";
      const version = ++requestVersion;
      run.disabled = true;
      run.textContent = "Checking…";
      try {
        const match = await onRun(prepared.testInput);
        if (version === requestVersion) renderResult({ match, input: prepared.testInput, note: prepared.note });
      } catch (cause) {
        if (version === requestVersion) error.textContent = `Could not check policies: ${cause.message || cause}`;
      } finally {
        run.disabled = false;
        run.textContent = "Check policy";
      }
    });
    reset.addEventListener("click", () => {
      destination.value = "";
      path = "";
      pathSelect.value = "";
      sourceKind = "";
      sourceIp.value = "";
      scope.value = "";
      renderSourceOptions();
      invalidateResult();
      error.textContent = "";
      try { sessionStorage.removeItem(draftKey); } catch (_) {}
      onReset();
    });
    return { panel, updateResult: renderResult };
  }

  root.TrafficPathPanel = { create };
})(window);
