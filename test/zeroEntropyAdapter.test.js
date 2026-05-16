const test = require("node:test");
const assert = require("node:assert/strict");

const { rerankObservationMemory, status } = require("../src/zeroEntropyAdapter");
const seedObservations = require("../data/observations.json");

test("reports retrieval readiness without requiring a hackathon API key", async () => {
  const previousKey = process.env.ZEROENTROPY_API_KEY;
  const previousAltKey = process.env.ZERO_ENTROPY_API_KEY;
  delete process.env.ZEROENTROPY_API_KEY;
  delete process.env.ZERO_ENTROPY_API_KEY;

  try {
    const current = status();
    const result = await rerankObservationMemory("strawberry aphids nearby leaf curling", seedObservations, {
      topN: 2
    });

    assert.equal(current.configured, false);
    assert.equal(result.ok, false);
    assert.equal(result.configured, false);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].fallback, true);
    assert.match(result.message, /ZEROENTROPY_API_KEY/);
  } finally {
    if (previousKey) process.env.ZEROENTROPY_API_KEY = previousKey;
    if (previousAltKey) process.env.ZERO_ENTROPY_API_KEY = previousAltKey;
  }
});
