const ISSUE_PROFILES = {
  aphids: {
    aliases: ["aphid", "aphids", "honeydew", "leaf curling", "curling"],
    scout: "undersides of new leaves, crown edges, and ant trails",
    biological: "release lacewing larvae or lady beetles in the affected rows and knock back colonies with insecticidal soap",
    chemicalThreshold: "escalate only if colonies exceed the block threshold after 24-48 hours of re-scouting"
  },
  "leaf curling": {
    aliases: ["leaf curling", "curling", "aphid", "aphids", "virus"],
    scout: "new growth in nearby strawberry rows and the upwind edge",
    biological: "treat as aphid-suspect first: intensify scouting and use a localized soft intervention where colonies are confirmed",
    chemicalThreshold: "do not spray until scouting confirms pest pressure above threshold"
  },
  "powdery mildew": {
    aliases: ["powdery mildew", "mildew", "powder", "fog", "humidity"],
    scout: "shaded lower canopy, dense foliage, and fog pockets",
    biological: "open canopy airflow where possible and apply a localized biological fungicide pass",
    chemicalThreshold: "reserve fungicide for expanding lesions or repeated high-humidity mornings"
  },
  "spider mites": {
    aliases: ["spider mites", "mites", "stippling", "webbing"],
    scout: "dusty road edges, hot rows, and lower leaf surfaces",
    biological: "release predatory mites into confirmed hot spots and reduce dust stress",
    chemicalThreshold: "only spot-treat rows that cross mite-per-leaf thresholds"
  }
};

function normalizeIssue(issue = "") {
  return String(issue).trim().toLowerCase();
}

function findProfile(issue = "") {
  const normalized = normalizeIssue(issue);
  if (ISSUE_PROFILES[normalized]) return ISSUE_PROFILES[normalized];

  for (const [key, profile] of Object.entries(ISSUE_PROFILES)) {
    if (profile.aliases.some((alias) => normalized.includes(alias))) {
      return ISSUE_PROFILES[key];
    }
  }

  return {
    aliases: [normalized],
    scout: "the reported rows, adjacent edges, and the nearest same-crop block",
    biological: "use a localized non-chemical intervention matched to the confirmed pest",
    chemicalThreshold: "escalate only after scouting confirms the economic threshold has been crossed"
  };
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function distanceMiles(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const earthRadiusMiles = 3958.8;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function bearingDegrees(from, to) {
  if (!from || !to) return null;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function angularDifference(a, b) {
  if (a == null || b == null) return 180;
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function daysBetween(a, b) {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 999;
  return Math.abs(left - right) / (1000 * 60 * 60 * 24);
}

function issueSimilarity(a, b) {
  const left = normalizeIssue(a);
  const right = normalizeIssue(b);
  if (!left || !right) return 0;
  if (left === right) return 35;
  const leftProfile = findProfile(left);
  const rightProfile = findProfile(right);
  const leftAliases = new Set(leftProfile.aliases.map(normalizeIssue));
  const overlap = rightProfile.aliases.some((alias) => leftAliases.has(normalizeIssue(alias)));
  return overlap ? 24 : 0;
}

function compareObservation(report, previous, fieldsById) {
  const reportField = fieldsById.get(report.fieldId);
  const previousField = fieldsById.get(previous.fieldId);
  const distance = distanceMiles(reportField?.centroid, previousField?.centroid);
  const ageDays = daysBetween(report.reportedAt, previous.reportedAt);
  const bearing = bearingDegrees(previousField?.centroid, reportField?.centroid);
  const windMatch = angularDifference(previous.windDirectionDeg, bearing) <= 65;

  let score = issueSimilarity(report.issue, previous.issue);
  const reasons = [];

  if (score >= 35) reasons.push("same pest pressure");
  else if (score > 0) reasons.push("compatible symptom pattern");

  if (report.crop === previous.crop) {
    score += 10;
    reasons.push("same crop");
  }

  if (distance <= 1.5) {
    score += 22;
    reasons.push("nearby block");
  } else if (distance <= 3) {
    score += 14;
    reasons.push("within three miles");
  } else if (distance <= 5) {
    score += 6;
    reasons.push("regional proximity");
  }

  if (ageDays <= 1) {
    score += 18;
    reasons.push("same-day timing");
  } else if (ageDays <= 7) {
    score += 12;
    reasons.push("recent timing");
  } else if (ageDays <= 21) {
    score += 6;
    reasons.push("same scouting window");
  }

  if (windMatch && previous.windDirectionDeg != null && bearing != null) {
    score += 8;
    reasons.push("wind-aligned spread path");
  }

  const severityBoost = Math.max(0, Number(previous.severity || 0) - 2) * 3;
  score += severityBoost;
  if (severityBoost) reasons.push("meaningful severity");

  return {
    observationId: previous.id,
    fieldName: previous.fieldName,
    zoneName: previous.zoneName,
    issue: previous.issue,
    score: Math.min(100, Math.round(score)),
    distanceMiles: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null,
    ageDays: Number(ageDays.toFixed(1)),
    reasons
  };
}

function classifyRisk(maxScore, severity) {
  if (severity >= 5 || (severity >= 4 && maxScore >= 60)) return "critical";
  if (severity >= 4 || maxScore >= 62) return "high";
  if (severity >= 3 || maxScore >= 38) return "moderate";
  return "low";
}

function riskCopy(level) {
  return {
    critical: "Likely spreading. Scout and intervene today before any whole-block spray decision.",
    high: "Connected outbreak pattern. Focus scouting on linked zones before escalating.",
    moderate: "Watch closely. The memory graph found enough signal to narrow the next scout pass.",
    low: "No strong spread signal yet. Keep the response local and re-check on the next round."
  }[level];
}

function buildActionPlan(report, observations, fields, options = {}) {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const reportField = fieldsById.get(report.fieldId);
  const priorObservations = observations.filter((observation) => observation.id !== report.id);
  const related = priorObservations
    .map((observation) => compareObservation(report, observation, fieldsById))
    .filter((comparison) => comparison.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const maxScore = related[0]?.score || 0;
  const severity = Number(report.severity || 1);
  const riskLevel = classifyRisk(maxScore, severity);
  const profile = findProfile(report.issue);
  const totalAcres = Number(options.totalAcres || fields.reduce((sum, field) => sum + Number(field.acres || 0), 0));
  const nearbyAcres = related.reduce((sum, item) => {
    const relatedObservation = observations.find((observation) => observation.id === item.observationId);
    return sum + Number(relatedObservation?.acres || 0);
  }, 0);
  const treatmentAcres = Math.min(
    totalAcres,
    Math.max(Number(report.acres || 0), Number(report.acres || 0) + nearbyAcres * 0.35)
  );
  const avoidedAcres = Math.max(0, totalAcres - treatmentAcres);
  const confidence = Math.min(
    96,
    Math.round(42 + severity * 8 + Math.min(28, related.length * 9) + Math.min(18, maxScore / 5))
  );

  const linkedZones = related
    .map((item) => `${item.fieldName} ${item.zoneName}`)
    .filter(Boolean)
    .slice(0, 3);
  const firstScoutTargets = [...new Set([
    `${reportField?.name || report.fieldName} ${report.zoneName}`,
    ...linkedZones
  ])];

  return {
    riskLevel,
    headline: riskCopy(riskLevel),
    confidence,
    related,
    treatmentAcres: Number(treatmentAcres.toFixed(1)),
    avoidedAcres: Number(avoidedAcres.toFixed(1)),
    firstScoutTargets,
    recommendations: [
      `Scout ${firstScoutTargets.join(", ")} within ${riskLevel === "critical" || riskLevel === "high" ? "24" : "48"} hours.`,
      `Check ${profile.scout}.`,
      `Start with a targeted biological response: ${profile.biological}.`,
      `Chemical guardrail: ${profile.chemicalThreshold}.`
    ]
  };
}

function summarizeFarm(observations, fields, totalAcres) {
  const active = observations.filter((observation) => observation.status !== "contained");
  const latest = [...observations].sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))[0];
  const latestPlan = latest
    ? buildActionPlan(latest, observations, fields, { totalAcres })
    : null;
  const targetedAcres = latestPlan?.treatmentAcres || 0;
  return {
    activeOutbreaks: active.length,
    totalObservations: observations.length,
    targetedAcres,
    avoidedAcres: latestPlan?.avoidedAcres || 0,
    confidence: latestPlan?.confidence || 0,
    latestObservationId: latest?.id || null,
    latestPlan
  };
}

function buildGraph(observations, fields) {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const nodes = fields.map((field) => ({
    id: field.id,
    label: field.name,
    type: "field",
    crop: field.crop,
    acres: field.acres
  }));

  const issueSet = new Set();
  for (const observation of observations) {
    issueSet.add(normalizeIssue(observation.issue));
  }
  for (const issue of issueSet) {
    nodes.push({
      id: `issue-${issue.replace(/[^a-z0-9]+/g, "-")}`,
      label: issue.replace(/\b\w/g, (char) => char.toUpperCase()),
      type: "issue"
    });
  }
  for (const observation of observations) {
    nodes.push({
      id: observation.id,
      label: observation.zoneName,
      type: "observation",
      severity: observation.severity
    });
  }

  const edges = [];
  for (const observation of observations) {
    edges.push({
      from: observation.id,
      to: observation.fieldId,
      type: "reported_in"
    });
    edges.push({
      from: observation.id,
      to: `issue-${normalizeIssue(observation.issue).replace(/[^a-z0-9]+/g, "-")}`,
      type: "detected"
    });
  }

  for (const observation of observations) {
    const links = observations
      .filter((candidate) => candidate.id !== observation.id)
      .map((candidate) => compareObservation(observation, candidate, fieldsById))
      .filter((comparison) => comparison.score >= 48);
    for (const link of links) {
      const edgeId = [observation.id, link.observationId].sort().join(":");
      if (!edges.some((edge) => edge.id === edgeId)) {
        edges.push({
          id: edgeId,
          from: observation.id,
          to: link.observationId,
          type: "possibly_related",
          score: link.score
        });
      }
    }
  }

  return { nodes, edges };
}

module.exports = {
  buildActionPlan,
  buildGraph,
  compareObservation,
  distanceMiles,
  findProfile,
  normalizeIssue,
  summarizeFarm
};
