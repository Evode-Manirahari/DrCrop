const test = require("node:test");
const assert = require("node:assert/strict");

const { hasGBrain, linkArgs, putArgs } = require("../src/gbrainAdapter");

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

test("GBrain write commands avoid stdin and use current link flags", () => {
  assert.deepEqual(putArgs("drcrop/observations/demo", "# Demo"), [
    "put",
    "drcrop/observations/demo",
    "--content",
    "# Demo"
  ]);
  assert.deepEqual(linkArgs("from", "to", "possibly_related_to"), [
    "link",
    "from",
    "to",
    "--link-type",
    "possibly_related_to"
  ]);
});
