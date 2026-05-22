const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const {
  AUDIT_COUNTIES,
  BLOCK_ACRES_MIN,
  BLOCK_ACRES_MAX,
  buildSignup,
  recordAuditSignup,
  redactEmail,
  validate
} = require("../src/auditSignup");

function basePayload(overrides = {}) {
  return {
    name: "Field Test",
    vineyard: "Test Vines",
    county: "Sonoma",
    blockAcres: "12.5",
    email: "alice@example.com",
    ...overrides
  };
}

async function withTempFile(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "drcrop-signup-"));
  const file = path.join(dir, "audit-signups.jsonl");
  try {
    return await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function collectLogger() {
  const logs = [];
  return { logger: { log: (line) => logs.push(line) }, logs };
}

test("validate accepts a clean payload", () => {
  const out = validate(basePayload());
  assert.equal(out.name, "Field Test");
  assert.equal(out.email, "alice@example.com");
  assert.equal(out.county, "Sonoma");
  assert.equal(out.blockAcres, 12.5);
});

test("validate rejects short or missing names", () => {
  assert.throws(() => validate(basePayload({ name: "" })), /name/);
  assert.throws(() => validate(basePayload({ name: "A" })), /name/);
});

test("validate rejects missing vineyard", () => {
  assert.throws(() => validate(basePayload({ vineyard: "" })), /vineyard/);
});

test("validate rejects malformed email", () => {
  assert.throws(() => validate(basePayload({ email: "" })), /email/);
  assert.throws(() => validate(basePayload({ email: "notanemail" })), /email/);
  assert.throws(() => validate(basePayload({ email: "missing@tld" })), /email/);
});

test("validate rejects counties outside the NorCal allowlist", () => {
  assert.throws(() => validate(basePayload({ county: "Texas" })), /county/);
  assert.throws(() => validate(basePayload({ county: "" })), /county/);
  assert.ok(AUDIT_COUNTIES.has("Napa"));
  assert.ok(AUDIT_COUNTIES.has("Other (NorCal)"));
});

test("validate rejects blockAcres below the minimum (regression: used to clamp 0 → 0.5)", () => {
  assert.throws(() => validate(basePayload({ blockAcres: "0" })), /between/);
  assert.throws(() => validate(basePayload({ blockAcres: "0.1" })), /between/);
  assert.throws(() => validate(basePayload({ blockAcres: "-5" })), /between/);
});

test("validate rejects blockAcres above the maximum (regression: used to clamp 50000 → 1000)", () => {
  assert.throws(() => validate(basePayload({ blockAcres: "50000" })), /between/);
  assert.throws(() => validate(basePayload({ blockAcres: "1001" })), /between/);
});

test("validate accepts blockAcres at exactly the min and max", () => {
  assert.equal(validate(basePayload({ blockAcres: String(BLOCK_ACRES_MIN) })).blockAcres, BLOCK_ACRES_MIN);
  assert.equal(validate(basePayload({ blockAcres: String(BLOCK_ACRES_MAX) })).blockAcres, BLOCK_ACRES_MAX);
});

test("validate rejects non-numeric blockAcres", () => {
  assert.throws(() => validate(basePayload({ blockAcres: "nope" })), /between/);
  assert.throws(() => validate(basePayload({ blockAcres: "" })), /between/);
  assert.throws(() => validate(basePayload({ blockAcres: null })), /between/);
});

test("validate lowercases the email and trims string fields", () => {
  const out = validate(basePayload({ email: "  Alice@Example.COM  ", name: "  Field Test  " }));
  assert.equal(out.email, "alice@example.com");
  assert.equal(out.name, "Field Test");
});

test("validate caps long string fields at 400 characters", () => {
  const out = validate(basePayload({ notes: "x".repeat(800) }));
  assert.equal(out.notes.length, 400);
});

test("redactEmail keeps first char + domain, hides the rest", () => {
  assert.equal(redactEmail("alice@example.com"), "a***@example.com");
  assert.equal(redactEmail("bob@vineyard.co"), "b***@vineyard.co");
  assert.equal(redactEmail("nope"), "***");
  assert.equal(redactEmail(""), "***");
});

test("buildSignup uses injected clock + rng so ids are deterministic in tests", () => {
  const signup = buildSignup(basePayload(), { now: () => 1700000000000, rand: () => 0.5 });
  assert.match(signup.id, /^aud-[a-z0-9]+-[a-z0-9]+$/);
  assert.equal(signup.receivedAt, new Date(1700000000000).toISOString());
});

test("recordAuditSignup persists the lead to jsonl", async () => {
  await withTempFile(async (file) => {
    const { logger } = collectLogger();
    const result = await recordAuditSignup(basePayload(), { signupsPath: file, logger });
    assert.equal(result.ok, true);
    const contents = await fs.readFile(file, "utf8");
    const lines = contents.trim().split("\n");
    assert.equal(lines.length, 1);
    const stored = JSON.parse(lines[0]);
    assert.equal(stored.email, "alice@example.com");
    assert.equal(stored.vineyard, "Test Vines");
    assert.equal(stored.county, "Sonoma");
    assert.equal(stored.blockAcres, 12.5);
  });
});

test("recordAuditSignup never logs the raw email (regression: PII in stdout)", async () => {
  await withTempFile(async (file) => {
    const { logger, logs } = collectLogger();
    await recordAuditSignup(basePayload({ email: "secret-grower@bigvineyard.com" }), {
      signupsPath: file,
      logger
    });
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes("[audit-signup]"));
    assert.ok(!logs[0].includes("secret-grower@bigvineyard.com"), "raw email leaked into log");
    assert.ok(logs[0].includes("s***@bigvineyard.com"), "redacted email missing from log");
  });
});

test("recordAuditSignup propagates validation errors without writing to disk", async () => {
  await withTempFile(async (file) => {
    const { logger, logs } = collectLogger();
    await assert.rejects(
      recordAuditSignup(basePayload({ blockAcres: "0" }), { signupsPath: file, logger }),
      /between/
    );
    await assert.rejects(fs.stat(file), { code: "ENOENT" });
    assert.equal(logs.length, 0);
  });
});
