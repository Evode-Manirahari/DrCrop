const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPayload, formatSubject, notifyNewSignup, status } = require("../src/notifier");

function fakeSignup(overrides = {}) {
  return {
    id: "aud-test-1",
    receivedAt: "2026-05-22T10:00:00.000Z",
    name: "Field Test",
    role: "Vineyard manager",
    vineyard: "Test Vines",
    county: "Sonoma",
    blockAcres: 12.5,
    email: "alice@example.com",
    phone: "707-555-0123",
    flyWindow: "next 4 weeks",
    notes: "gate code 1234",
    herbicideProgram: "glyphosate 2x/season",
    userAgent: "Mozilla/5.0",
    ...overrides
  };
}

function recordingFetch() {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
  };
}

function failingFetch(statusCode = 502, body = "upstream") {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(body, { status: statusCode });
    }
  };
}

function throwingFetch(message = "ECONNREFUSED") {
  const calls = [];
  return {
    calls,
    fetch: async () => {
      throw new Error(message);
    }
  };
}

function quietLogger() {
  const warnings = [];
  return { warn: (line) => warnings.push(line), log: () => {}, warnings };
}

test("status reports enabled only when both key and recipient are set", () => {
  assert.deepEqual(status({}), { enabled: false, hasKey: false, hasRecipient: false });
  assert.deepEqual(status({ RESEND_API_KEY: "x" }), { enabled: false, hasKey: true, hasRecipient: false });
  assert.deepEqual(status({ DRCROP_LEAD_NOTIFY_EMAIL: "a@b.co" }), { enabled: false, hasKey: false, hasRecipient: true });
  assert.deepEqual(
    status({ RESEND_API_KEY: "x", DRCROP_LEAD_NOTIFY_EMAIL: "a@b.co" }),
    { enabled: true, hasKey: true, hasRecipient: true }
  );
});

test("notifyNewSignup is a no-op when env is not configured", async () => {
  const { fetch, calls } = recordingFetch();
  const logger = quietLogger();
  const result = await notifyNewSignup(fakeSignup(), { env: {}, fetch, logger });
  assert.equal(result.sent, false);
  assert.equal(result.reason, "notifier-disabled");
  assert.equal(calls.length, 0, "should not call fetch when disabled");
  assert.equal(logger.warnings.length, 0);
});

test("notifyNewSignup posts to Resend with the right shape when configured", async () => {
  const { fetch, calls } = recordingFetch();
  const env = {
    RESEND_API_KEY: "re_test_key",
    DRCROP_LEAD_NOTIFY_EMAIL: "you@drcrop.example"
  };
  const result = await notifyNewSignup(fakeSignup(), { env, fetch, logger: quietLogger() });
  assert.equal(result.sent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer re_test_key");
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ["you@drcrop.example"]);
  assert.equal(body.reply_to, "alice@example.com");
  assert.ok(body.subject.includes("Test Vines"));
  assert.ok(body.subject.includes("Sonoma"));
  assert.ok(body.subject.includes("12.5"));
});

test("notifyNewSignup honors DRCROP_LEAD_NOTIFY_FROM override", async () => {
  const { fetch, calls } = recordingFetch();
  const env = {
    RESEND_API_KEY: "re_test",
    DRCROP_LEAD_NOTIFY_EMAIL: "you@drcrop.example",
    DRCROP_LEAD_NOTIFY_FROM: "DrCrop <leads@drcrop.example>"
  };
  await notifyNewSignup(fakeSignup(), { env, fetch, logger: quietLogger() });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.from, "DrCrop <leads@drcrop.example>");
});

test("notifyNewSignup returns ok=false on a Resend HTTP error but does not throw", async () => {
  const { fetch } = failingFetch(422, "invalid_recipient");
  const logger = quietLogger();
  const env = { RESEND_API_KEY: "re_test", DRCROP_LEAD_NOTIFY_EMAIL: "you@drcrop.example" };
  const result = await notifyNewSignup(fakeSignup(), { env, fetch, logger });
  assert.equal(result.ok, false);
  assert.equal(result.sent, false);
  assert.equal(result.reason, "resend-422");
  assert.ok(logger.warnings.some((line) => line.includes("Resend 422")), "should warn on non-2xx");
});

test("notifyNewSignup returns ok=false on a thrown fetch error", async () => {
  const { fetch } = throwingFetch("network down");
  const logger = quietLogger();
  const env = { RESEND_API_KEY: "re_test", DRCROP_LEAD_NOTIFY_EMAIL: "you@drcrop.example" };
  const result = await notifyNewSignup(fakeSignup(), { env, fetch, logger });
  assert.equal(result.reason, "fetch-error");
  assert.ok(logger.warnings.some((line) => line.includes("network down")));
});

test("formatSubject and buildPayload include all relevant fields", () => {
  const env = { RESEND_API_KEY: "x", DRCROP_LEAD_NOTIFY_EMAIL: "you@drcrop.example" };
  const subject = formatSubject(fakeSignup());
  assert.match(subject, /New audit signup/);
  assert.match(subject, /Test Vines/);
  const payload = buildPayload(fakeSignup(), env);
  assert.match(payload.text, /Block acres: 12\.5/);
  assert.match(payload.text, /Email:\s+alice@example\.com/);
  assert.match(payload.text, /Lead aud-test-1/);
  assert.match(payload.text, /glyphosate 2x\/season/);
});
