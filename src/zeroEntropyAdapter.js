const endpoint = process.env.ZEROENTROPY_API_URL || "https://api.zeroentropy.dev/v1/models/rerank";
const model = process.env.ZEROENTROPY_RERANK_MODEL || "zerank-2";

function apiKey() {
  return process.env.ZEROENTROPY_API_KEY || process.env.ZERO_ENTROPY_API_KEY || "";
}

function status() {
  return {
    configured: Boolean(apiKey()),
    model,
    endpoint
  };
}

function observationDocument(observation) {
  return [
    `Field: ${observation.fieldName}`,
    `Zone: ${observation.zoneName}`,
    `Crop: ${observation.crop}`,
    `Issue: ${observation.issue}`,
    `Severity: ${observation.severity}/5`,
    `Status: ${observation.status}`,
    `Reported: ${observation.reportedAt}`,
    `Symptoms: ${observation.symptoms}`
  ].join("\n");
}

async function rerankObservationMemory(query, observations, options = {}) {
  const key = apiKey();
  const documents = observations.map(observationDocument);
  const topN = Math.min(options.topN || 5, documents.length);

  if (!key) {
    return {
      ok: false,
      configured: false,
      model,
      message: "Set ZEROENTROPY_API_KEY to enable hosted context reranking.",
      results: observations.slice(0, topN).map((observation, index) => ({
        observationId: observation.id,
        index,
        relevanceScore: null,
        document: documents[index],
        fallback: true
      }))
    };
  }

  if (!documents.length) {
    return { ok: true, configured: true, model, results: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        query,
        documents,
        top_n: topN,
        latency: options.latency || "fast"
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        configured: true,
        model,
        status: response.status,
        message: payload.detail || payload.error || response.statusText,
        results: []
      };
    }

    return {
      ok: true,
      configured: true,
      model,
      totalBytes: payload.total_bytes,
      latencyMs: payload.e2e_latency,
      results: (payload.results || []).map((result) => ({
        observationId: observations[result.index]?.id,
        index: result.index,
        relevanceScore: result.relevance_score,
        document: documents[result.index]
      }))
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      model,
      message: error.name === "AbortError" ? "ZeroEntropy request timed out." : error.message,
      results: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  rerankObservationMemory,
  status
};
