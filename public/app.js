const state = {
  farm: null,
  observations: [],
  selectedObservationId: null,
  graph: null,
  summary: null
};

const els = {
  activeOutbreaks: document.getElementById("activeOutbreaks"),
  targetedAcres: document.getElementById("targetedAcres"),
  avoidedAcres: document.getElementById("avoidedAcres"),
  confidence: document.getElementById("confidence"),
  heroAvoidedAcres: document.getElementById("heroAvoidedAcres"),
  heroTargetedAcres: document.getElementById("heroTargetedAcres"),
  heroActiveOutbreaks: document.getElementById("heroActiveOutbreaks"),
  heroConfidence: document.getElementById("heroConfidence"),
  farmName: document.getElementById("farmName"),
  farmLocation: document.getElementById("farmLocation"),
  gbrainStatus: document.getElementById("gbrainStatus"),
  retrievalStatus: document.getElementById("retrievalStatus"),
  agronomistStatus: document.getElementById("agronomistStatus"),
  briefingPanel: document.querySelector(".briefing-panel"),
  briefingButton: document.getElementById("briefingButton"),
  briefingText: document.getElementById("briefingText"),
  briefingMeta: document.getElementById("briefingMeta"),
  briefingHeadline: document.getElementById("briefingHeadline"),
  briefingRisk: document.getElementById("briefingRisk"),
  briefingCopy: document.getElementById("briefingCopy"),
  fieldMap: document.getElementById("fieldMap"),
  fieldId: document.getElementById("fieldId"),
  zoneName: document.getElementById("zoneName"),
  severity: document.getElementById("severity"),
  severityValue: document.getElementById("severityValue"),
  form: document.getElementById("observationForm"),
  submitButton: document.getElementById("submitButton"),
  planTitle: document.getElementById("planTitle"),
  planHeadline: document.getElementById("planHeadline"),
  recommendations: document.getElementById("recommendations"),
  relatedMemory: document.getElementById("relatedMemory"),
  graphView: document.getElementById("graphView"),
  timeline: document.getElementById("timeline"),
  refreshButton: document.getElementById("refreshButton"),
  resetDemoButton: document.getElementById("resetDemoButton"),
  memorySearch: document.getElementById("memorySearch"),
  memoryQuery: document.getElementById("memoryQuery"),
  memoryOutput: document.getElementById("memoryOutput")
};

function formatNumber(value, suffix = "") {
  const number = Number(value || 0);
  return `${Number.isInteger(number) ? number : number.toFixed(1)}${suffix}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function riskClass(riskLevel) {
  return ["low", "moderate", "high", "critical"].includes(riskLevel) ? riskLevel : "moderate";
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function loadState() {
  const payload = await fetchJson("/api/state");
  state.farm = payload.farm;
  state.observations = payload.observations;
  state.graph = payload.graph;
  state.summary = payload.summary;
  if (!state.selectedObservationId) {
    state.selectedObservationId = payload.summary.latestObservationId;
  }
  renderAll(payload.gbrain, payload.zeroEntropy, payload.agronomist);
}

function renderAll(gbrain, zeroEntropy, agronomist) {
  renderFarm(gbrain, zeroEntropy, agronomist);
  renderMetrics();
  renderFieldControls();
  renderMap();
  renderPlan();
  renderGraph();
  renderTimeline();
}

function renderFarm(gbrain, zeroEntropy, agronomist) {
  els.farmName.textContent = state.farm?.farmName || "Farm memory";
  els.farmLocation.textContent = state.farm?.location || "Unknown location";
  els.gbrainStatus.textContent = gbrain?.available ? `GBrain ${gbrain.version}` : gbrain?.disabled ? "GBrain disabled" : "GBrain offline";
  els.gbrainStatus.classList.toggle("good", Boolean(gbrain?.available));
  els.gbrainStatus.classList.toggle("bad", !gbrain?.available && !gbrain?.disabled);
  els.gbrainStatus.classList.toggle("muted", Boolean(gbrain?.disabled));
  els.retrievalStatus.textContent = zeroEntropy?.configured ? `ZeroEntropy ${zeroEntropy.model}` : "ZeroEntropy key needed";
  els.retrievalStatus.classList.toggle("good", Boolean(zeroEntropy?.configured));
  els.retrievalStatus.classList.toggle("bad", !zeroEntropy?.configured);
  if (els.agronomistStatus) {
    els.agronomistStatus.textContent = agronomist?.configured ? `Claude ${agronomist.model}` : "Claude key needed";
    els.agronomistStatus.classList.toggle("good", Boolean(agronomist?.configured));
    els.agronomistStatus.classList.toggle("bad", !agronomist?.configured);
  }
}

function renderMetrics() {
  const summary = state.summary || {};
  els.activeOutbreaks.textContent = formatNumber(summary.activeOutbreaks);
  els.targetedAcres.textContent = formatNumber(summary.targetedAcres, " ac");
  els.avoidedAcres.textContent = formatNumber(summary.avoidedAcres, " ac");
  els.confidence.textContent = formatNumber(summary.confidence, "%");
  if (els.heroAvoidedAcres) {
    els.heroAvoidedAcres.textContent = formatNumber(summary.avoidedAcres);
  }
  if (els.heroTargetedAcres) {
    els.heroTargetedAcres.textContent = formatNumber(summary.targetedAcres);
  }
  if (els.heroActiveOutbreaks) {
    els.heroActiveOutbreaks.textContent = formatNumber(summary.activeOutbreaks);
  }
  if (els.heroConfidence) {
    els.heroConfidence.textContent = formatNumber(summary.confidence, "%");
  }
}

function renderFieldControls() {
  const currentField = els.fieldId.value;
  els.fieldId.innerHTML = "";
  for (const field of state.farm.fields) {
    const option = document.createElement("option");
    option.value = field.id;
    option.textContent = `${field.name} (${field.crop})`;
    els.fieldId.append(option);
  }
  if (currentField) els.fieldId.value = currentField;
  renderZones();
}

function renderZones() {
  const field = state.farm.fields.find((item) => item.id === els.fieldId.value) || state.farm.fields[0];
  els.zoneName.innerHTML = "";
  for (const zone of field.zones || [field.scoutPriority]) {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = zone;
    els.zoneName.append(option);
  }
}

function observationsForField(fieldId) {
  return state.observations.filter((observation) => observation.fieldId === fieldId);
}

function markerPosition(index) {
  const positions = [
    [68, 34],
    [28, 63],
    [48, 54],
    [75, 70],
    [34, 35]
  ];
  return positions[index % positions.length];
}

function renderMap() {
  els.fieldMap.innerHTML = "";
  for (const field of state.farm.fields) {
    const block = document.createElement("article");
    block.className = `field-block ${field.crop.toLowerCase()}`;
    const label = document.createElement("div");
    label.className = "field-label";
    label.innerHTML = `<strong>${field.name}</strong><span>${field.crop} | ${field.acres} acres</span>`;
    block.append(label);

    observationsForField(field.id).forEach((observation, index) => {
      const marker = document.createElement("button");
      const risk = riskClass(observation.analysis?.riskLevel);
      const [left, top] = markerPosition(index);
      marker.className = `marker ${risk}`;
      marker.type = "button";
      marker.style.left = `${left}%`;
      marker.style.top = `${top}%`;
      marker.title = `${observation.issue}: ${observation.zoneName}`;
      marker.addEventListener("click", () => {
        state.selectedObservationId = observation.id;
        renderPlan();
        renderTimeline();
      });
      if (risk === "high" || risk === "critical") {
        const pulse = document.createElement("span");
        pulse.className = "pulse-ring";
        marker.append(pulse);
      }
      block.append(marker);
    });
    els.fieldMap.append(block);
  }
}

function selectedObservation() {
  return (
    state.observations.find((observation) => observation.id === state.selectedObservationId) ||
    state.observations[0]
  );
}

function resetBriefingForObservation(observation) {
  if (!els.briefingText || !observation) return;
  if (els.briefingText.dataset.observationId === observation.id) return;
  els.briefingText.dataset.observationId = observation.id;
  els.briefingText.textContent = "Generate a farmer-ready briefing grounded in this observation, the memory graph, and the action plan.";
  els.briefingMeta.textContent = "";
}

function renderPlan() {
  const observation = selectedObservation();
  if (!observation) return;
  const analysis = observation.analysis;
  resetBriefingForObservation(observation);
  els.planTitle.textContent = `${observation.fieldName}: ${observation.issue}`;
  els.planHeadline.textContent = analysis.headline;
  if (els.briefingHeadline) {
    els.briefingHeadline.textContent = `${observation.fieldName} · ${observation.issue}`;
  }
  if (els.briefingRisk) {
    els.briefingRisk.textContent = analysis.riskLevel;
    els.briefingRisk.className = `risk-badge ${riskClass(analysis.riskLevel)}`;
  }

  els.recommendations.innerHTML = "";
  for (const recommendation of analysis.recommendations) {
    const li = document.createElement("li");
    li.textContent = recommendation;
    els.recommendations.append(li);
  }

  els.relatedMemory.innerHTML = "";
  if (!analysis.related.length) {
    const empty = document.createElement("div");
    empty.className = "memory-link";
    empty.innerHTML = "<strong>No linked outbreak memory</strong><span>Keep treatment local until the next scout pass.</span>";
    els.relatedMemory.append(empty);
    return;
  }
  for (const related of analysis.related) {
    const node = document.createElement("div");
    node.className = "memory-link";
    node.innerHTML = `<strong>${related.score}/100 ${related.fieldName}</strong><span>${related.issue} in ${related.zoneName}. ${related.reasons.join(", ")}.</span>`;
    els.relatedMemory.append(node);
  }
}

function renderGraph() {
  els.graphView.innerHTML = "";
  const nodes = [...(state.graph?.nodes || [])]
    .sort((a, b) => {
      const rank = { field: 0, issue: 1, observation: 2 };
      return (rank[a.type] ?? 9) - (rank[b.type] ?? 9);
    })
    .slice(0, 12);
  for (const node of nodes) {
    const item = document.createElement("div");
    item.className = `graph-node ${node.type}`;
    item.innerHTML = `<strong>${node.label}</strong><span>${node.type}${node.severity ? ` | severity ${node.severity}` : ""}</span>`;
    els.graphView.append(item);
  }
}

function renderTimeline() {
  els.timeline.innerHTML = "";
  for (const observation of state.observations) {
    const item = document.createElement("article");
    item.className = `timeline-item ${observation.id === state.selectedObservationId ? "active" : ""}`;
    item.innerHTML = `
      <strong>${observation.fieldName}: ${observation.issue}</strong>
      <span>${observation.zoneName} | ${formatDate(observation.reportedAt)} | severity ${observation.severity}/5 | ${observation.status}</span>
      <span>${observation.symptoms}</span>
    `;
    const actions = document.createElement("div");
    actions.className = "timeline-actions";
    const view = document.createElement("button");
    view.type = "button";
    view.textContent = "View";
    view.addEventListener("click", () => {
      state.selectedObservationId = observation.id;
      renderPlan();
      renderTimeline();
    });
    const contain = document.createElement("button");
    contain.type = "button";
    contain.textContent = observation.status === "contained" ? "Contained" : "Mark contained";
    contain.disabled = observation.status === "contained";
    contain.addEventListener("click", () => markContained(observation.id));
    actions.append(view, contain);
    item.append(actions);
    els.timeline.append(item);
  }
}

async function markContained(id) {
  await fetchJson(`/api/observations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "contained" })
  });
  await loadState();
}

async function resetDemo() {
  els.resetDemoButton.disabled = true;
  els.resetDemoButton.textContent = "Resetting";
  try {
    await fetchJson("/api/demo/reset", { method: "POST", body: "{}" });
    state.selectedObservationId = null;
    els.memoryOutput.textContent = "Demo memory reset to the seed Sonoma scenario.";
    await loadState();
  } catch (error) {
    els.memoryOutput.textContent = `Reset failed: ${error.message}`;
  } finally {
    els.resetDemoButton.disabled = false;
    els.resetDemoButton.textContent = "Reset";
  }
}

async function submitObservation(event) {
  event.preventDefault();
  els.submitButton.disabled = true;
  els.submitButton.textContent = "Writing memory";
  const formData = new FormData(els.form);
  const payload = Object.fromEntries(formData.entries());
  payload.severity = Number(payload.severity);
  payload.acres = Number(payload.acres);
  payload.windDirectionDeg = Number(payload.windDirectionDeg);
  try {
    const result = await fetchJson("/api/observations", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.selectedObservationId = result.observation.id;
    if (result.gbrain?.queued) {
      els.memoryOutput.textContent = `Observation saved. GBrain write queued in background (id: ${result.gbrain.observationId}).`;
      pollGBrainStatus(result.gbrain.observationId);
    } else if (result.gbrain?.ok) {
      els.memoryOutput.textContent = `Wrote ${result.gbrain.observationSlug} to GBrain.\n${(result.gbrain.operations || []).map((op) => `${op.ok ? "ok" : "fail"} ${op.command}`).join("\n")}`;
    } else {
      els.memoryOutput.textContent = `Observation saved locally. GBrain note: ${(result.gbrain?.errors || ["not available"]).join("\n")}`;
    }
    if (result.retrieval) {
      const retrievalLine = result.retrieval.ok
        ? `\n\nZeroEntropy reranked ${result.retrieval.results.length} memories with ${result.retrieval.model}.`
        : `\n\nZeroEntropy fallback: ${result.retrieval.message}`;
      els.memoryOutput.textContent += retrievalLine;
    }
    await loadState();
    void generateBriefing();
  } catch (error) {
    els.memoryOutput.textContent = error.message;
  } finally {
    els.submitButton.disabled = false;
    els.submitButton.textContent = "Submit report";
  }
}

async function searchMemory(event) {
  event.preventDefault();
  els.memoryOutput.textContent = "Retrieving context";
  try {
    const result = await fetchJson(`/api/context/retrieve?q=${encodeURIComponent(els.memoryQuery.value)}`);
    els.memoryOutput.textContent = result.ok
      ? result.results.map((item, rank) => `${rank + 1}. ${item.relevanceScore ?? "local"} ${item.observationId}\n${item.document}`).join("\n\n")
      : `${result.message || "Hosted retrieval is not configured."}\n\n${result.results.map((item, rank) => `${rank + 1}. ${item.observationId}\n${item.document}`).join("\n\n")}`;
  } catch (error) {
    els.memoryOutput.textContent = error.message;
  }
}

els.fieldId.addEventListener("change", renderZones);
els.severity.addEventListener("input", () => {
  els.severityValue.textContent = els.severity.value;
});
els.form.addEventListener("submit", submitObservation);
els.refreshButton.addEventListener("click", loadState);
els.resetDemoButton?.addEventListener("click", resetDemo);
els.memorySearch.addEventListener("submit", searchMemory);

async function generateBriefing() {
  const observation = selectedObservation();
  if (!observation || !els.briefingButton) return;
  els.briefingButton.disabled = true;
  els.briefingButton.textContent = "Thinking…";
  els.briefingPanel?.setAttribute("data-thinking", "true");
  els.briefingText.textContent = "Asking the agronomist to read the memory graph and write a briefing.";
  els.briefingMeta.textContent = "";
  try {
    const result = await fetchJson("/api/agronomist/briefing", {
      method: "POST",
      body: JSON.stringify({ observationId: observation.id })
    });
    const briefing = result.briefing || {};
    els.briefingText.dataset.observationId = observation.id;
    els.briefingText.textContent = briefing.briefing || "No briefing returned.";
    const tag = briefing.fallback
      ? (briefing.configured ? `Fallback used: ${briefing.error || briefing.note || "Claude unavailable."}` : briefing.note || "Set ANTHROPIC_API_KEY to enable Claude.")
      : `Generated by ${briefing.model}`;
    els.briefingMeta.textContent = tag;
  } catch (error) {
    els.briefingText.textContent = `Briefing failed: ${error.message}`;
    els.briefingMeta.textContent = "";
  } finally {
    els.briefingButton.disabled = false;
    els.briefingButton.textContent = "Generate briefing";
    els.briefingPanel?.removeAttribute("data-thinking");
  }
}

async function pollGBrainStatus(observationId, attempts = 0) {
  if (attempts > 30) return;
  try {
    const result = await fetchJson("/api/gbrain/recent");
    const entry = (result.entries || []).find((item) => item.observationId === observationId);
    if (!entry) {
      setTimeout(() => pollGBrainStatus(observationId, attempts + 1), 2000);
      return;
    }
    if (entry.status === "in_progress") {
      els.memoryOutput.textContent = `GBrain write in progress for ${observationId}.\n${(entry.operations || []).slice(-3).map((op) => `${op.ok ? "ok" : "fail"} ${op.command}`).join("\n")}`;
      setTimeout(() => pollGBrainStatus(observationId, attempts + 1), 2000);
      return;
    }
    const lines = (entry.operations || []).map((op) => `${op.ok ? "ok" : "fail"} ${op.command}`).join("\n");
    els.memoryOutput.textContent = entry.status === "complete"
      ? `GBrain write complete for ${observationId}.\n${lines}`
      : `GBrain write finished with errors for ${observationId}.\n${(entry.errors || []).join("\n")}\n${lines}`;
  } catch (error) {
    // silent — UX shouldn't break if status polling fails
  }
}

async function copyBriefing() {
  if (!els.briefingText || !els.briefingCopy) return;
  const text = els.briefingText.textContent || "";
  if (!text.trim()) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = els.briefingCopy.textContent;
    els.briefingCopy.textContent = "Copied";
    setTimeout(() => {
      els.briefingCopy.textContent = original;
    }, 1400);
  } catch (error) {
    els.briefingCopy.textContent = "Copy failed";
    setTimeout(() => {
      els.briefingCopy.textContent = "Copy";
    }, 1400);
  }
}

els.briefingButton?.addEventListener("click", generateBriefing);
els.briefingCopy?.addEventListener("click", copyBriefing);

loadState().catch((error) => {
  document.body.innerHTML = `<main class="shell"><section class="panel"><h1>DrCrop failed to load</h1><p>${error.message}</p></section></main>`;
});
