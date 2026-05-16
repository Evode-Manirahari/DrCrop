const endpoint = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
const model = process.env.DRCROP_AGRONOMIST_MODEL || "claude-sonnet-4-6";
const apiVersion = "2023-06-01";

function apiKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "";
}

function status() {
  return { configured: Boolean(apiKey()), model };
}

const SYSTEM_PROMPT = `You are DrCrop, an experienced agronomist advising a specialty-crop grower in California.

Your job: turn one structured pest observation, the deterministic action plan, and the linked outbreak memory into a calm, plain-English briefing for the farmer.

Hard rules:
- Lead with what to do *today*. Be specific about the zone.
- Always recommend a biological-first intervention before any chemical escalation.
- Cite linked memory by field and zone when it changes the plan.
- Never invent observations, fields, or pest types that are not in the data you are given.
- 90 to 130 words. Three to five short sentences. No bullet points. No emoji.
- Speak like a trusted advisor on the phone, not a chatbot. End with the chemical guardrail.`;

function compactObservation(observation) {
  return {
    field: observation.fieldName,
    zone: observation.zoneName,
    crop: observation.crop,
    issue: observation.issue,
    severity: `${observation.severity}/5`,
    affectedAcres: observation.acres,
    symptoms: observation.symptoms,
    reportedAt: observation.reportedAt
  };
}

function compactPlan(analysis) {
  return {
    risk: analysis.riskLevel,
    headline: analysis.headline,
    confidence: `${analysis.confidence}%`,
    targetedAcres: analysis.treatmentAcres,
    avoidedAcres: analysis.avoidedAcres,
    scoutTargets: analysis.firstScoutTargets,
    deterministicRecommendations: analysis.recommendations,
    linkedMemory: (analysis.related || []).map((item) => ({
      field: item.fieldName,
      zone: item.zoneName,
      issue: item.issue,
      relationshipScore: item.score,
      distanceMiles: item.distanceMiles,
      ageDays: item.ageDays,
      reasons: item.reasons
    }))
  };
}

function compactRetrieval(retrieval) {
  if (!retrieval || !retrieval.results?.length) return null;
  return retrieval.results.slice(0, 3).map((item) => ({
    observationId: item.observationId,
    relevanceScore: item.relevanceScore,
    snippet: (item.document || "").slice(0, 240)
  }));
}

function buildUserMessage(observation, analysis, retrieval) {
  return JSON.stringify({
    newObservation: compactObservation(observation),
    deterministicPlan: compactPlan(analysis),
    rerankedMemory: compactRetrieval(retrieval),
    farmTotalAcres: analysis._totalAcres ?? null
  }, null, 2);
}

function fallbackBriefing(observation, analysis) {
  const targets = analysis.firstScoutTargets?.join(", ") || `${observation.fieldName} ${observation.zoneName}`;
  const linked = (analysis.related || [])
    .slice(0, 2)
    .map((item) => `${item.fieldName} (${item.reasons.slice(0, 2).join(", ")})`)
    .join(" and ");
  const linkedLine = linked
    ? ` This connects to ${linked}, so the memory graph is pointing us at a single outbreak instead of a blanket spray.`
    : "";
  const profile = analysis.recommendations?.[2] || "Start with a localized biological intervention.";
  const guardrail = analysis.recommendations?.[3] || "Hold chemical escalation until scouting confirms the threshold.";
  return [
    `Risk level is ${analysis.riskLevel} with ${analysis.confidence}% memory confidence on the ${observation.issue.toLowerCase()} report in ${observation.fieldName} ${observation.zoneName}.`,
    `Scout ${targets} first today.${linkedLine}`,
    profile,
    `That keeps the response on roughly ${analysis.treatmentAcres} acres and avoids about ${analysis.avoidedAcres} acres of unnecessary spray.`,
    guardrail
  ].join(" ");
}

async function generateBriefing(observation, analysis, retrieval, options = {}) {
  const key = apiKey();
  if (!key) {
    return {
      ok: true,
      model: null,
      configured: false,
      fallback: true,
      briefing: fallbackBriefing(observation, analysis),
      note: "Set ANTHROPIC_API_KEY to enable the Claude-powered briefing."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": key,
        "anthropic-version": apiVersion,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: options.model || model,
        max_tokens: 320,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
        ],
        messages: [
          { role: "user", content: buildUserMessage(observation, analysis, retrieval) }
        ]
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        configured: true,
        model: options.model || model,
        fallback: true,
        briefing: fallbackBriefing(observation, analysis),
        error: payload.error?.message || response.statusText,
        status: response.status
      };
    }

    const text = (payload.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return {
      ok: Boolean(text),
      configured: true,
      model: payload.model || options.model || model,
      fallback: !text,
      briefing: text || fallbackBriefing(observation, analysis),
      usage: payload.usage || null
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      model: options.model || model,
      fallback: true,
      briefing: fallbackBriefing(observation, analysis),
      error: error.name === "AbortError" ? "Claude request timed out." : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  fallbackBriefing,
  generateBriefing,
  status
};
