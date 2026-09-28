// =============================================================================
// traffic-path-panel.js — Policy Checker UI (window.TrafficPathPanel).
//
// Connection first; the source fields then narrow to what that connection
// actually exposes; destination last. Results show one row per enforcement
// stage (DNS → Firewall → Web, or Private access) with the matched rule, and
// turn "a higher rule depends on the destination's category" into a
// multiple-choice question instead of a dead end.
// =============================================================================
(function (root) {
  "use strict";

  const DRAFT_KEY = "psc.policyChecker.draft.v2";

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  // ---------------------------------------------------------------------------
  // Searchable picker over one or more catalogs
  // ---------------------------------------------------------------------------
  function createPicker({ id, placeholder, getOptions, onChange }) {
    const MAX_VISIBLE = 60;
    const wrap = node("div", "tp-picker");
    const input = node("input", "tp-input tp-picker-input");
    input.id = id;
    input.type = "text";
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    const clear = node("button", "tp-picker-clear", "×");
    clear.type = "button";
    clear.setAttribute("aria-label", "Clear");
    clear.hidden = true;
    const list = node("ul", "tp-picker-list");
    list.id = `${id}-list`;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    input.setAttribute("aria-controls", list.id);
    wrap.append(input, clear, list);

    let value = "";
    let selectedLabel = "";
    let active = -1;
    let shown = [];

    function setOpen(open) {
      list.hidden = !open;
      input.setAttribute("aria-expanded", String(open));
      if (!open) active = -1;
    }
    function render() {
      const query = input.value.trim().toLowerCase();
      const all = getOptions();
      const filtered = query && query !== selectedLabel.toLowerCase()
        ? all.filter(option => option.label.toLowerCase().includes(query))
        : all;
      shown = filtered.slice(0, MAX_VISIBLE);
      list.replaceChildren();
      if (!all.length) {
        list.append(node("li", "tp-picker-empty", "Nothing loaded yet. Open the dashboard policy page to refresh."));
      } else if (!shown.length) {
        list.append(node("li", "tp-picker-empty", "No matches"));
      }
      shown.forEach((option, index) => {
        const item = node("li", "tp-picker-option");
        item.id = `${id}-opt-${index}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(option.value === value));
        if (index === active) item.classList.add("is-active");
        item.append(node("span", "tp-picker-label", option.label));
        if (option.badge) item.append(node("span", "tp-picker-badge", option.badge));
        item.addEventListener("mousedown", event => {
          event.preventDefault();
          choose(option);
        });
        list.append(item);
      });
      if (filtered.length > shown.length) list.append(node("li", "tp-picker-empty", `${filtered.length - shown.length} more — keep typing to narrow`));
      input.setAttribute("aria-activedescendant", active >= 0 ? `${id}-opt-${active}` : "");
    }
    function choose(option, silent) {
      value = option ? option.value : "";
      selectedLabel = option ? option.label : "";
      input.value = selectedLabel;
      clear.hidden = !value;
      setOpen(false);
      if (!silent) onChange(value);
    }
    input.addEventListener("focus", () => { render(); setOpen(true); });
    input.addEventListener("input", () => { active = -1; render(); setOpen(true); });
    input.addEventListener("blur", () => {
      setOpen(false);
      if (input.value.trim() !== selectedLabel) {
        if (!input.value.trim() && value) choose(null);
        else input.value = selectedLabel;
      }
    });
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (list.hidden) { render(); setOpen(true); }
        if (!shown.length) return;
        active = event.key === "ArrowDown" ? Math.min(shown.length - 1, active + 1) : Math.max(0, active - 1);
        render();
        const current = list.querySelector(".is-active");
        if (current) current.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" && !list.hidden) {
        event.preventDefault();
        const pick = shown[active >= 0 ? active : 0];
        if (pick) choose(pick);
      } else if (event.key === "Escape" && !list.hidden) {
        event.preventDefault();
        setOpen(false);
      }
    });
    clear.addEventListener("click", () => { choose(null); input.focus(); });

    return {
      element: wrap,
      input,
      get value() { return value; },
      set(nextValue) {
        const option = getOptions().find(item => item.value === nextValue);
        choose(option || null, true);
      },
      refresh() {
        if (!value) return;
        const option = getOptions().find(item => item.value === value);
        if (option) { selectedLabel = option.label; if (document.activeElement !== input) input.value = option.label; }
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------
  function create(container, catalogs, onRun, onHighlight) {
    const model = root.TrafficPath;
    let activeCatalogs = catalogs || {};
    let connection = "";
    let facts = {};
    let factsFor = "";
    let lastEvaluation = null;
    let runSeq = 0;

    const panel = node("section", "tp-panel");
    panel.id = "tp-panel";
    const header = node("header", "tp-header");
    const titleWrap = node("div", "tp-title-wrap");
    titleWrap.append(node("h1", "tp-title", "Policy Checker"), node("p", "tp-subtitle", "Predict which rule a request hits at each enforcement point."));
    const reset = node("button", "tp-reset", "Reset");
    reset.type = "button";
    header.append(titleWrap, reset);
    panel.append(header);

    const form = node("form", "tp-form");
    form.noValidate = true;

    // 1. Connection -------------------------------------------------------
    const connectionStep = node("fieldset", "tp-step");
    connectionStep.append(stepLegend("1", "Connection"));
    const cards = node("div", "tp-connection-cards");
    const radios = {};
    for (const [key, config] of Object.entries(model.CONNECTIONS)) {
      const label = node("label", "tp-connection");
      const radio = node("input", "tp-connection-radio");
      radio.type = "radio";
      radio.name = "tp-connection";
      radio.value = key;
      radios[key] = radio;
      const body = node("span", "tp-connection-body");
      body.append(node("span", "tp-connection-name", config.label), node("span", "tp-connection-layers", config.layers));
      label.append(radio, body);
      cards.append(label);
      radio.addEventListener("change", () => setConnection(key, true));
    }
    const connectionHint = node("p", "tp-hint tp-connection-hint", "Choose how the traffic reaches Secure Access.");
    connectionStep.append(cards, connectionHint);

    // 2. Source ------------------------------------------------------------
    const sourceStep = node("fieldset", "tp-step");
    sourceStep.append(stepLegend("2", "Source"));
    const sourceFields = node("div", "tp-source-fields");
    const sourceHint = node("p", "tp-hint", "The request carries every identity you fill in. Leave the ones you don't know empty.");
    sourceStep.append(sourceFields, sourceHint);

    const pickers = {};
    const fieldWraps = {};
    function catalogOptions(kind) {
      const source = model.SOURCES[kind];
      const options = [];
      for (const catalogKey of source.catalogs) {
        const items = activeCatalogs[catalogKey] || {};
        const badge = source.catalogs.length > 1 ? (catalogKey === "sourceGroups" ? "Group" : "User") : "";
        for (const id of Object.keys(items)) {
          const label = model.catalogLabel(activeCatalogs, catalogKey, id);
          if (label) options.push({ value: `${catalogKey}:${id}`, label, badge });
        }
      }
      return options.sort((a, b) => a.label.localeCompare(b.label));
    }
    for (const [kind, source] of Object.entries(model.SOURCES)) {
      const field = node("div", `tp-field tp-field-${kind}`);
      const label = node("label", "tp-label", source.label);
      label.htmlFor = `tp-src-${kind}`;
      field.append(label);
      if (kind === "internalIp") {
        const input = node("input", "tp-input");
        input.id = `tp-src-${kind}`;
        input.placeholder = source.placeholder;
        input.autocomplete = "off";
        input.spellcheck = false;
        input.addEventListener("input", changed);
        pickers[kind] = { element: input, input, get value() { return input.value.trim(); }, set(v) { input.value = v || ""; }, refresh() {} };
        field.append(input);
      } else {
        const picker = createPicker({ id: `tp-src-${kind}`, placeholder: source.placeholder, getOptions: () => catalogOptions(kind), onChange: changed });
        pickers[kind] = picker;
        field.append(picker.element);
      }
      fieldWraps[kind] = field;
      field.hidden = true;
      sourceFields.append(field);
    }

    // 3. Destination -------------------------------------------------------
    const destinationStep = node("fieldset", "tp-step");
    destinationStep.append(stepLegend("3", "Destination"));
    const destinationLabel = node("label", "tp-label", "Domain, URL, or IP address");
    destinationLabel.htmlFor = "tp-destination";
    const destination = node("input", "tp-input");
    destination.id = "tp-destination";
    destination.placeholder = "example.com · https://example.com/login · 203.0.113.10";
    destination.autocomplete = "off";
    destination.spellcheck = false;
    const transport = node("div", "tp-transport");
    transport.hidden = true;
    const portField = node("div", "tp-field");
    const portLabel = node("label", "tp-label", "Port");
    portLabel.htmlFor = "tp-port";
    const port = node("input", "tp-input");
    port.id = "tp-port";
    port.inputMode = "numeric";
    port.placeholder = "443";
    portField.append(portLabel, port);
    const protocolField = node("div", "tp-field");
    const protocolLabel = node("label", "tp-label", "Protocol");
    protocolLabel.htmlFor = "tp-protocol";
    const protocol = node("select", "tp-input");
    protocol.id = "tp-protocol";
    model.PROTOCOLS.forEach(name => {
      const option = node("option", "", name);
      option.value = name;
      protocol.append(option);
    });
    protocolField.append(protocolLabel, protocol);
    transport.append(portField, protocolField);
    const destinationHint = node("p", "tp-hint");
    destinationStep.append(destinationLabel, destination, transport, destinationHint);

    const error = node("p", "tp-error");
    error.setAttribute("role", "alert");
    const actions = node("div", "tp-actions");
    const run = node("button", "tp-primary", "Check policy");
    run.type = "submit";
    actions.append(run);
    form.append(connectionStep, sourceStep, destinationStep, error, actions);
    panel.append(form);

    const results = node("section", "tp-results");
    results.setAttribute("aria-live", "polite");
    results.setAttribute("aria-label", "Policy check result");
    panel.append(results);
    container.append(panel);

    function stepLegend(number, text) {
      const legend = node("legend", "tp-step-legend");
      legend.append(node("span", "tp-step-number", number), node("span", "", text));
      return legend;
    }

    // State ----------------------------------------------------------------
    function setConnection(key, userAction) {
      connection = key;
      if (radios[key]) radios[key].checked = true;
      const config = model.CONNECTIONS[key];
      connectionHint.textContent = config ? config.description : "Choose how the traffic reaches Secure Access.";
      for (const [kind, field] of Object.entries(fieldWraps)) field.hidden = !config || !config.sources.includes(kind);
      // Order the visible fields the way the connection lists them.
      if (config) config.sources.forEach(kind => sourceFields.append(fieldWraps[kind]));
      sourceStep.disabled = !config;
      destinationStep.disabled = !config;
      sourceStep.classList.toggle("is-waiting", !config);
      destinationStep.classList.toggle("is-waiting", !config);
      updateDestinationHint();
      if (userAction) changed();
    }

    function updateDestinationHint() {
      const parsed = destination.value.trim() ? model.parseDestination(destination.value) : null;
      const showTransport = !!parsed && !parsed.error && parsed.kind === "ip" && !parsed.fromUrl && connection !== "va";
      transport.hidden = !showTransport;
      port.disabled = protocol.value === "ICMP";
      if (!connection) destinationHint.textContent = "";
      else if (connection === "va") destinationHint.textContent = "The VA only forwards DNS, so enter the domain being looked up.";
      else if (connection === "tunnel") destinationHint.textContent = "Enter an IP address to include the firewall. A domain checks DNS and Web.";
      else destinationHint.textContent = "A domain checks DNS then Web (HTTPS). A URL uses its own port.";
    }

    function currentForm() {
      const sources = {};
      for (const kind of Object.keys(model.SOURCES)) sources[kind] = pickers[kind].value;
      return { connection, sources, destination: destination.value, port: port.value, protocol: protocol.value };
    }

    function persist() {
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(currentForm())); } catch (_) {}
    }

    function changed() {
      runSeq++;
      error.textContent = "";
      results.replaceChildren();
      lastEvaluation = null;
      persist();
    }

    destination.addEventListener("input", () => { updateDestinationHint(); changed(); });
    port.addEventListener("input", changed);
    protocol.addEventListener("change", () => { updateDestinationHint(); changed(); });

    // Run -----------------------------------------------------------------
    form.addEventListener("submit", event => {
      event.preventDefault();
      check();
    });

    async function check() {
      const draft = currentForm();
      const key = `${draft.destination.trim().toLowerCase()}|${draft.port}|${draft.protocol}`;
      if (key !== factsFor) { facts = {}; factsFor = key; }
      const built = model.buildRequest({ ...draft, facts }, activeCatalogs);
      if (built.error) {
        error.textContent = built.error;
        results.replaceChildren();
        return;
      }
      error.textContent = "";
      const seq = ++runSeq;
      run.disabled = true;
      run.textContent = "Checking…";
      try {
        const evaluation = await onRun(built.request);
        if (seq !== runSeq) return;
        if (evaluation.error) {
          error.textContent = evaluation.error;
          results.replaceChildren();
          return;
        }
        lastEvaluation = { request: built.request, evaluation };
        renderResult(built.request, evaluation);
      } catch (cause) {
        if (seq === runSeq) error.textContent = `Could not check policies: ${cause && cause.message ? cause.message : cause}`;
      } finally {
        run.disabled = false;
        run.textContent = "Check policy";
      }
    }

    // Results ---------------------------------------------------------------
    function ruleTitle(rule) {
      return rule.ruleName || rule.name || "Unnamed rule";
    }
    function rulePriority(rule) {
      const priority = rule.rulePriority !== undefined ? rule.rulePriority : rule.order;
      const isDefault = (rule.ruleIsDefault !== undefined ? rule.ruleIsDefault : rule.is_default) === true;
      return isDefault ? "Default rule" : priority !== undefined && priority !== null ? `Priority ${priority}` : "";
    }

    function renderResult(request, evaluation) {
      results.replaceChildren();
      const { outcome, stages, scope, groups } = evaluation;
      const hostLabel = request.destination.host;

      const banner = node("div", `tp-outcome tp-outcome-${outcome.status}`);
      const bannerCopy = node("div", "tp-outcome-copy");
      bannerCopy.append(node("strong", "tp-outcome-title", outcome.title));
      const summary = outcome.rule
        ? `${ruleTitle(outcome.rule)} · ${rulePriority(outcome.rule)}`
        : outcome.status === "pending" ? "Answer the question below to finish the check." : "Default rules should always match. Refresh the dashboard data and try again.";
      bannerCopy.append(node("span", "tp-outcome-rule", summary));
      banner.append(node("span", "tp-outcome-dot"), bannerCopy);
      const highlightable = stages.filter(result => result.state === "matched");
      if (highlightable.length) {
        const show = node("button", "tp-secondary", "Show on page");
        show.type = "button";
        show.addEventListener("click", () => onHighlight(highlightTargets(highlightable), summaryFor(request, evaluation)));
        banner.append(show);
      }
      results.append(banner);

      const flow = node("ol", "tp-flow");
      flow.setAttribute("aria-label", "Enforcement stages");
      for (const result of stages) flow.append(stageRow(result));
      results.append(flow);

      const pending = stages.find(result => result.state === "needs-answer");
      if (pending) {
        const question = model.questionFor(pending, hostLabel, evaluation.lookups || activeCatalogs);
        if (question) results.append(questionCard(question));
        else results.append(node("p", "tp-note", pending.match.reason));
      }

      const details = node("details", "tp-details");
      details.append(node("summary", "", "What was checked"));
      const body = node("dl", "tp-details-body");
      const addRow = (term, value) => { body.append(node("dt", "", term), node("dd", "", value)); };
      addRow("Connection", model.CONNECTIONS[request.connection].label);
      addRow("Identities", request.identities.map(identity => identity.label).join(", "));
      if (groups.length) addRow("Via groups", groups.map(group => group.name).join(", "));
      const dest = request.destination;
      addRow("Destination", `${dest.host}${dest.kind === "ip" && dest.port ? ` · ${dest.protocol} ${dest.port}` : dest.fromUrl ? ` · port ${dest.port}` : ""}`);
      addRow("Scope", scope.scope === "private_network"
        ? `Private Access${scope.resourceNames.length ? ` · ${scope.resourceNames.join(", ")}` : " · internal address"}`
        : "Internet");
      if (dest.kind === "domain" && !dest.fromUrl && stages.some(result => result.stage.key === "web")) addRow("Assumed", "Web request over HTTPS (TCP 443)");
      const labelsFor = key => Object.entries(facts).flatMap(([field, value]) => value[key].map(id => model.valueLabel(field, id, evaluation.lookups || activeCatalogs)));
      const isList = labelsFor("yes");
      const notList = labelsFor("no");
      if (isList.length) addRow("You said it is", isList.join(", "));
      if (notList.length) addRow("You said it isn't", notList.join(", "));
      details.append(body);
      for (const result of stages.filter(item => item.state === "matched")) {
        const reasons = node("div", "tp-reasons");
        reasons.append(node("strong", "", `${result.stage.label}: why ${ruleTitle(result.match.rule)} matched`));
        const list = node("ul", "");
        (result.match.matchedConditions || []).forEach(condition => list.append(node("li", "", readableReason(String(condition), evaluation))));
        reasons.append(list);
        details.append(reasons);
      }
      results.append(details);
    }

    // Matcher reasons are written for debugging ("umbrella.destination.
    // category_ids: '27' matched"); name the value where we can.
    function readableReason(text, evaluation) {
      const lookups = evaluation.lookups || activeCatalogs;
      if (/^source: catch-all/.test(text)) return "Source: any";
      if (/^destination: catch-all/.test(text)) return "Destination: any";
      if (/^source: not constrained/.test(text)) return "Source: not restricted by this rule";
      const hit = text.match(/^(umbrella\.[a-z_.]+): '([^']+)' matched(?: member (.+))?$/i);
      if (!hit) return text;
      const [, attribute, value, member] = hit;
      const name = attribute.toLowerCase();
      if (name === "umbrella.source.identity_ids") {
        const group = evaluation.groups.find(item => item.id === value);
        if (group) return `Source: group ${group.name}`;
        for (const key of ["sourceUsers", "sourceGroups", "sourceRoaming", "sourceSites", "sourceNetworks", "sourceTunnelGroups"]) {
          const label = model.catalogLabel(lookups, key, value);
          if (label) return `Source: ${label}`;
        }
        return `Source: identity ${value}`;
      }
      if (name === "umbrella.source.identity_type_ids") {
        const typeName = lookups.identityTypeNames && lookups.identityTypeNames[value];
        return `Source: all ${typeName ? (typeof typeName === "string" ? typeName : typeName.name || typeName.label) : `identities of type ${value}`}`;
      }
      const field = root.Matcher && root.Matcher.classificationField(attribute);
      if (field) return `Destination: ${model.valueLabel(field, value, lookups)}`;
      if (member) return `Destination: ${member} (in a list on this rule)`;
      return `Destination: ${value}`;
    }

    function stageRow(result) {
      const row = node("li", `tp-stage tp-stage-${result.state}`);
      row.append(node("span", "tp-stage-name", result.stage.label));
      const body = node("div", "tp-stage-body");
      if (result.state === "matched") {
        const rule = result.match.rule;
        const head = node("div", "tp-stage-head");
        head.append(node("span", `tp-action tp-action-${result.action}`, model.actionLabel(result.action)), node("span", "tp-stage-rule", ruleTitle(rule)));
        body.append(head);
        const meta = [rulePriority(rule)];
        if (result.conditional) meta.push(`if ${result.conditional.label} lets it through`);
        body.append(node("span", "tp-stage-meta", meta.filter(Boolean).join(" · ")));
        if (result.webProfileId) body.append(node("span", "tp-stage-meta", "Security profile controls on this rule can still block content."));
      } else {
        const text = result.state === "needs-answer"
          ? ["Needs a detail", `${ruleTitle(result.match.rule)} (${rulePriority(result.match.rule)}) depends on ${result.match.pending && result.match.pending.length ? "what the destination is" : "the traffic port or protocol"}.`]
          : result.state === "no-match" ? ["No rule matched", "No loaded rule covers this stage."]
            : result.state === "not-reached" ? ["Not reached", result.reason]
              : ["Not evaluated", result.reason || ""];
        const head = node("div", "tp-stage-head");
        head.append(node("span", `tp-action tp-action-${result.state}`, text[0]));
        body.append(head, node("span", "tp-stage-meta", text[1]));
      }
      row.append(body);
      return row;
    }

    function questionCard(question) {
      const card = node("form", "tp-question");
      card.append(node("strong", "tp-question-title", question.prompt));
      card.append(node("p", "tp-question-why", `“${question.ruleName}” is evaluated before any later rule and depends on this. Tick everything that applies, or none.`));
      for (const group of question.groups) {
        const set = node("fieldset", "tp-question-group");
        const legend = node("legend", "", group.noun.charAt(0).toUpperCase() + group.noun.slice(1));
        set.append(legend);
        for (const option of group.options) {
          const label = node("label", "tp-option");
          const box = node("input", "");
          box.type = "checkbox";
          box.value = option.id;
          const copy = node("span", "tp-option-copy");
          copy.append(node("span", "", option.label));
          if (option.hint) copy.append(node("span", "tp-option-hint", option.hint));
          label.append(box, copy);
          set.append(label);
        }
        card.append(set);
      }
      const submit = node("button", "tp-primary", "Continue");
      submit.type = "submit";
      card.append(submit);
      card.addEventListener("submit", event => {
        event.preventDefault();
        const picked = [...card.querySelectorAll("input[type=checkbox]:checked")].map(box => box.value);
        facts = model.answer(facts, question, picked);
        check();
      });
      return card;
    }

    function highlightTargets(matched) {
      const byRule = new Map();
      for (const result of matched) {
        const name = ruleTitle(result.match.rule);
        const entry = byRule.get(name) || { ruleName: name, stages: [], action: result.action, matchedConditions: result.match.matchedConditions };
        entry.stages.push(result.stage.label);
        byRule.set(name, entry);
      }
      return [...byRule.values()];
    }

    function summaryFor(request, evaluation) {
      return {
        title: evaluation.outcome.title,
        status: evaluation.outcome.status,
        destination: request.destination.host,
        stages: evaluation.stages.map(result => ({
          label: result.stage.label,
          state: result.state,
          action: result.state === "matched" ? model.actionLabel(result.action) : "",
          rule: result.match && result.match.rule ? ruleTitle(result.match.rule) : "",
        })),
      };
    }

    // Reset / restore -------------------------------------------------------
    reset.addEventListener("click", () => {
      for (const picker of Object.values(pickers)) picker.set("");
      Object.values(radios).forEach(radio => { radio.checked = false; });
      destination.value = "";
      port.value = "";
      protocol.value = "TCP";
      facts = {};
      setConnection("", false);
      changed();
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {}
    });

    function restore() {
      let draft = null;
      try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch (_) {}
      if (!draft) { setConnection("", false); return; }
      for (const kind of Object.keys(model.SOURCES)) if (draft.sources && draft.sources[kind]) pickers[kind].set(draft.sources[kind]);
      destination.value = draft.destination || "";
      port.value = draft.port || "";
      if (model.PROTOCOLS.includes(draft.protocol)) protocol.value = draft.protocol;
      setConnection(model.CONNECTIONS[draft.connection] ? draft.connection : "", false);
    }
    restore();

    function updateCatalogs(nextCatalogs) {
      activeCatalogs = nextCatalogs || {};
      let draft = null;
      try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch (_) {}
      for (const [kind, picker] of Object.entries(pickers)) {
        if (!picker.value && draft && draft.sources && draft.sources[kind]) picker.set(draft.sources[kind]);
        else picker.refresh();
      }
    }

    return { panel, updateCatalogs, get lastEvaluation() { return lastEvaluation; } };
  }

  root.TrafficPathPanel = { create };
})(window);
