const test = require("node:test");
const assert = require("node:assert/strict");

const observations = require("../data/observations.json");
const seedObservations = require("../data/observations.seed.json");

test("demo starts from the intended Sonoma memory seed", () => {
  assert.deepEqual(observations, seedObservations);
  assert.equal(observations.length, 3);
  assert.ok(observations.some((item) => item.id === "obs-20260516-alpha-aphid"));
  assert.ok(observations.some((item) => item.id === "obs-20260516-beta-curling"));
});
