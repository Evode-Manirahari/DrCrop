const fs = require("fs/promises");
const path = require("path");

const root = path.resolve(__dirname, "..");
const farmPath = path.join(root, "data", "farm.json");
const observationsPath = path.join(root, "data", "observations.json");
const seedObservationsPath = path.join(root, "data", "observations.seed.json");

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function loadFarm() {
  return readJson(farmPath, { farmName: "Demo Farm", totalAcres: 0, fields: [] });
}

async function loadObservations() {
  return readJson(observationsPath, []);
}

async function saveObservations(observations) {
  await writeJson(observationsPath, observations);
}

async function appendObservation(observation) {
  const observations = await loadObservations();
  if (observations.some((item) => item.id === observation.id)) {
    observation = { ...observation, id: `${observation.id}-${Date.now().toString(36)}` };
  }
  observations.push(observation);
  await saveObservations(observations);
  return observations;
}

async function loadSeedObservations() {
  return readJson(seedObservationsPath, []);
}

async function resetDemo(seedObservations) {
  const next = seedObservations || await loadSeedObservations();
  await saveObservations(next);
  return next;
}

module.exports = {
  appendObservation,
  loadFarm,
  loadObservations,
  loadSeedObservations,
  resetDemo,
  saveObservations
};
