const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const { buildActionPlan, buildGraph, summarizeFarm } = require("./src/riskEngine");
const { appendObservation, loadFarm, loadObservations, resetDemo, saveObservations } = require("./src/storage");
const { hasGBrain, recordObservation, searchMemory } = require("./src/gbrainAdapter");
const zeroEntropy = require("./src/zeroEntropyAdapter");
const agronomistAgent = require("./src/agronomistAgent");

const root = __dirname;
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function sendJson(res, statusCode, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, { error: message, details });
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error("Request body too large");
    }
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

function cleanString(value, fallback = "") {
  const cleaned = String(value ?? fallback).trim();
  return cleaned.slice(0, 400);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function routeError(message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getState() {
  const farm = await loadFarm();
  const observations = await loadObservations();
  const enriched = observations.map((observation) => ({
    ...observation,
    analysis: buildActionPlan(observation, observations, farm.fields, { totalAcres: farm.totalAcres })
  }));
  return {
    farm,
    observations: enriched.sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)),
    graph: buildGraph(observations, farm.fields),
    summary: summarizeFarm(observations, farm.fields, farm.totalAcres),
    gbrain: hasGBrain(),
    zeroEntropy: zeroEntropy.status(),
    agronomist: agronomistAgent.status()
  };
}

async function getHealth() {
  const farm = await loadFarm();
  const observations = await loadObservations();
  const gbrain = hasGBrain();
  const retrieval = zeroEntropy.status();
  const agronomist = agronomistAgent.status();
  const checks = {
    dataLoaded: Boolean(farm.fields?.length && observations.length),
    gbrainPathReady: Boolean(gbrain.available || gbrain.disabled),
    retrievalPathReady: true,
    agronomistPathReady: true
  };
  return {
    ok: Object.values(checks).every(Boolean),
    demoReady: Object.values(checks).every(Boolean),
    checks,
    farm: farm.farmName,
    observations: observations.length,
    gbrain,
    zeroEntropy: retrieval,
    agronomist
  };
}

async function createObservation(payload) {
  const farm = await loadFarm();
  const fields = farm.fields || [];
  const field = fields.find((item) => item.id === payload.fieldId);
  if (!field) {
    throw routeError("Choose a valid field before submitting the scout report.");
  }

  const reportedAt = payload.reportedAt ? new Date(payload.reportedAt) : new Date();
  const safeDate = Number.isFinite(reportedAt.getTime()) ? reportedAt : new Date();
  const issue = cleanString(payload.issue, "Unknown pest");
  const symptoms = cleanString(payload.symptoms, "");
  if (!symptoms || symptoms.length < 8) {
    throw routeError("Add at least a short symptom note so the memory is useful.");
  }
  const observation = {
    id: `obs-${safeDate.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${field.id}-${issue.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "issue"}`,
    fieldId: field.id,
    fieldName: field.name,
    zoneName: field.zones?.includes(payload.zoneName)
      ? payload.zoneName
      : cleanString(payload.zoneName, field.scoutPriority || field.zones?.[0] || "reported zone"),
    crop: field.crop,
    issue,
    symptoms,
    severity: clampNumber(payload.severity, 1, 5, 3),
    acres: Number(clampNumber(payload.acres, 0.1, field.acres, 1).toFixed(1)),
    reportedAt: safeDate.toISOString(),
    windDirectionDeg: clampNumber(payload.windDirectionDeg, 0, 359, 225),
    status: payload.status === "contained" ? "contained" : payload.status === "watch" ? "watch" : "active",
    source: "drcrop-console"
  };

  const previous = await loadObservations();
  const analysis = buildActionPlan(observation, [...previous, observation], fields, { totalAcres: farm.totalAcres });
  const observations = await appendObservation(observation);

  const retrieval = await zeroEntropy.rerankObservationMemory(
    `${observation.crop} ${observation.issue} ${observation.symptoms}`,
    previous,
    { topN: 4, timeoutMs: 4500 }
  );

  trackGBrainWrite(observation, analysis);

  return {
    observation: {
      ...observation,
      analysis
    },
    summary: summarizeFarm(observations, fields, farm.totalAcres),
    graph: buildGraph(observations, fields),
    gbrain: { enabled: true, queued: true, observationId: observation.id, message: "GBrain write queued in background." },
    retrieval
  };
}

const gbrainQueue = new Map();
const MAX_GBRAIN_QUEUE_ENTRIES = 100;

function trackGBrainWrite(observation, analysis) {
  if (process.env.DRCROP_GBRAIN === "0") return;
  const entry = {
    observationId: observation.id,
    startedAt: new Date().toISOString(),
    status: "in_progress",
    operations: [],
    errors: []
  };
  gbrainQueue.set(observation.id, entry);
  while (gbrainQueue.size > MAX_GBRAIN_QUEUE_ENTRIES) {
    const oldest = gbrainQueue.keys().next().value;
    if (oldest === undefined) break;
    gbrainQueue.delete(oldest);
  }
  Promise.resolve()
    .then(() => recordObservation(observation, analysis))
    .then((result) => {
      entry.status = result.ok ? "complete" : "failed";
      entry.operations = result.operations || [];
      entry.errors = result.errors || [];
      entry.finishedAt = new Date().toISOString();
    })
    .catch((error) => {
      entry.status = "failed";
      entry.errors = [error?.message || String(error)];
      entry.finishedAt = new Date().toISOString();
    });
}

async function updateObservationStatus(id, status) {
  const observations = await loadObservations();
  const next = observations.map((observation) =>
    observation.id === id
      ? { ...observation, status: status === "contained" ? "contained" : status === "watch" ? "watch" : "active" }
      : observation
  );
  await saveObservations(next);
  return next.find((observation) => observation.id === id);
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, await getHealth());
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, await getState());
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/observations") {
    const payload = await readBody(req);
    sendJson(res, 201, await createObservation(payload));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/demo/reset") {
    const observations = await resetDemo();
    const farm = await loadFarm();
    sendJson(res, 200, {
      ok: true,
      observations,
      graph: buildGraph(observations, farm.fields),
      summary: summarizeFarm(observations, farm.fields, farm.totalAcres)
    });
    return true;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/observations/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/observations/", ""));
    const payload = await readBody(req);
    const observation = await updateObservationStatus(id, payload.status);
    if (!observation) sendError(res, 404, "Observation not found");
    else sendJson(res, 200, { observation });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/gbrain/recent") {
    const observationId = url.searchParams.get("observationId");
    if (observationId) {
      const entry = gbrainQueue.get(observationId);
      sendJson(res, 200, { entries: entry ? [entry] : [] });
      return true;
    }
    const recent = [...gbrainQueue.values()]
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, 8);
    sendJson(res, 200, { entries: recent });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/gbrain/search") {
    const query = url.searchParams.get("q") || "drcrop";
    sendJson(res, 200, await searchMemory(query));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/context/retrieve") {
    const query = url.searchParams.get("q") || "strawberry aphids nearby leaf curling";
    const observations = await loadObservations();
    sendJson(res, 200, await zeroEntropy.rerankObservationMemory(query, observations, { topN: 5 }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/agronomist/briefing") {
    const payload = await readBody(req);
    const farm = await loadFarm();
    const observations = await loadObservations();
    const targetId = payload.observationId;
    const observation =
      observations.find((item) => item.id === targetId) ||
      [...observations].sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))[0];
    if (!observation) {
      sendError(res, 404, "No observation available to brief on.");
      return true;
    }
    const analysis = buildActionPlan(observation, observations, farm.fields, { totalAcres: farm.totalAcres });
    const retrieval = await zeroEntropy.rerankObservationMemory(
      `${observation.crop} ${observation.issue} ${observation.symptoms}`,
      observations.filter((item) => item.id !== observation.id),
      { topN: 4, timeoutMs: 4500 }
    );
    const briefing = await agronomistAgent.generateBriefing(observation, analysis, retrieval, {
      timeoutMs: Number(payload.timeoutMs) || 8000
    });
    sendJson(res, 200, {
      observationId: observation.id,
      analysis,
      retrieval,
      briefing
    });
    return true;
  }

  return false;
}

function safeStaticPath(urlPathname) {
  const requested = urlPathname === "/" ? "/index.html" : urlPathname;
  const decoded = decodeURIComponent(requested);
  const resolved = path.resolve(publicDir, `.${decoded}`);
  if (!resolved.startsWith(publicDir)) return null;
  return resolved;
}

async function serveStatic(req, res, url) {
  const filePath = safeStaticPath(url.pathname);
  if (!filePath) {
    sendError(res, 403, "Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      const index = await fs.readFile(path.join(publicDir, "index.html"));
      res.writeHead(200, {
        "content-type": contentTypes[".html"],
        "cache-control": "no-store"
      });
      res.end(index);
    } else {
      throw error;
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) sendError(res, 404, "API route not found");
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const details = statusCode >= 500 && process.env.NODE_ENV !== "production" ? error.stack : undefined;
    sendError(res, statusCode, error.message || "Server error", details);
  }
});

server.listen(port, () => {
  console.log(`DrCrop running at http://localhost:${port}`);
});
