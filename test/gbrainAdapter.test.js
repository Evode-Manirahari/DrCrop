const test = require("node:test");
const assert = require("node:assert/strict");

const { hasGBrain } = require("../src/gbrainAdapter");

test("GBrain can be explicitly disabled for hosted deployments", () => {
  const previous = process.env.DRCROP_GBRAIN;
  process.env.DRCROP_GBRAIN = "0";

  try {
    const status = hasGBrain();
    assert.equal(status.available, false);
    assert.equal(status.disabled, true);
    assert.equal(status.error, null);
  } finally {
    if (previous === undefined) delete process.env.DRCROP_GBRAIN;
    else process.env.DRCROP_GBRAIN = previous;
  }
});
