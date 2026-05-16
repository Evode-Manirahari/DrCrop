const test = require("node:test");
const assert = require("node:assert/strict");

const { fallbackBriefing, generateBriefing, status } = require("../src/agronomistAgent");
const { buildActionPlan } = require("../src/riskEngine");
const farm = require("../data/farm.json");
const seedObservations = require("../data/observations.json");

test("agronomist fallback briefing reads like a plain-English plan when no key is set", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousAlt = process.env.CLAUDE_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;

  try {
    const observation = seedObservations.find((item) => item.id === "obs-20260516-beta-curling");
    const analysis = buildActionPlan(observation, seedObservations, farm.fields, { totalAcres: farm.totalAcres });

    const current = status();
    const result = await generateBriefing(observation, analysis, null);

    assert.equal(current.configured, false);
    assert.equal(result.ok, true);
    assert.equal(result.fallback, true);
    assert.match(result.briefing, /Field Beta/);
    assert.match(result.briefing, /biological|scout/i);

    const fallback = fallbackBriefing(observation, analysis);
    assert.match(fallback, /Field Beta/);
  } finally {
    if (previousKey) process.env.ANTHROPIC_API_KEY = previousKey;
    if (previousAlt) process.env.CLAUDE_API_KEY = previousAlt;
  }
});
