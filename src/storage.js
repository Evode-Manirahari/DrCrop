const fs = require("fs/promises");
const path = require("path");

const root = path.resolve(__dirname, "..");
const farmPath = path.join(root, "data", "farm.json");
const observationsPath = path.join(root, "data", "observations.json");

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
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  observations.push(observation);
  await saveObservations(observations);
  return observations;
}

async function resetDemo(seedObservations) {
  await saveObservations(seedObservations);
}

module.exports = {
  appendObservation,
  loadFarm,
  loadObservations,
  resetDemo,
  saveObservations
};
