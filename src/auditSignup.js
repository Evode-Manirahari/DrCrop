const fs = require("fs/promises");
const path = require("path");

const AUDIT_COUNTIES = new Set([
  "Napa",
  "Sonoma",
  "Mendocino",
  "Lake",
  "Marin",
  "Solano",
  "Other (NorCal)"
]);

const BLOCK_ACRES_MIN = 0.5;
const BLOCK_ACRES_MAX = 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimField(value) {
  return String(value ?? "").trim().slice(0, 400);
}

function validationError(message) {
  const err = new Error(message);
  err.statusCode = 422;
  return err;
}

function redactEmail(email) {
  // Keep first char of local part + full domain so logs stay grep-able
  // for support without storing PII in plaintext. alice@x.com -> a***@x.com.
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function validate(payload) {
  const name = trimField(payload.name);
  const vineyard = trimField(payload.vineyard);
  const email = trimField(payload.email).toLowerCase();
  const county = trimField(payload.county);
  const rawAcres = payload.blockAcres;
  const blockAcres = Number(rawAcres);

  if (!name || name.length < 2) throw validationError("Please share your name so we can follow up.");
  if (!vineyard) throw validationError("Tell us which vineyard you're with.");
  if (!email || !EMAIL_PATTERN.test(email)) throw validationError("That email doesn't look right — please double-check.");
  if (!AUDIT_COUNTIES.has(county)) throw validationError("Pick a Northern California county from the list.");
  if (rawAcres === "" || rawAcres == null || !Number.isFinite(blockAcres)) {
    throw validationError(`Block acres should be a number between ${BLOCK_ACRES_MIN} and ${BLOCK_ACRES_MAX}.`);
  }
  if (blockAcres < BLOCK_ACRES_MIN || blockAcres > BLOCK_ACRES_MAX) {
    throw validationError(`Block acres should be between ${BLOCK_ACRES_MIN} and ${BLOCK_ACRES_MAX}.`);
  }

  return {
    name,
    role: trimField(payload.role),
    vineyard,
    county,
    blockAcres,
    herbicideProgram: trimField(payload.herbicideProgram),
    email,
    phone: trimField(payload.phone),
    flyWindow: trimField(payload.flyWindow),
    notes: trimField(payload.notes),
    userAgent: trimField(payload.userAgent)
  };
}

function buildSignup(payload, { now = Date.now, rand = Math.random } = {}) {
  const validated = validate(payload);
  return {
    id: `aud-${now().toString(36)}-${rand().toString(36).slice(2, 8)}`,
    receivedAt: new Date(now()).toISOString(),
    ...validated
  };
}

async function recordAuditSignup(payload, options = {}) {
  const signupsPath = options.signupsPath;
  const logger = options.logger || console;
  const clock = options.now;
  const rng = options.rand;
  const notify = options.notify;
  if (!signupsPath) throw new Error("recordAuditSignup requires options.signupsPath");

  const signup = buildSignup(payload, { now: clock, rand: rng });

  await fs.mkdir(path.dirname(signupsPath), { recursive: true });
  await fs.appendFile(signupsPath, `${JSON.stringify(signup)}\n`, "utf8");
  logger.log(
    `[audit-signup] ${signup.id} ${signup.vineyard} (${signup.county}, ${signup.blockAcres}ac) <${redactEmail(signup.email)}>`
  );

  if (typeof notify === "function") {
    // Fire-and-forget so a Resend outage doesn't 500 the signup request.
    Promise.resolve()
      .then(() => notify(signup))
      .catch((error) => logger.warn(`[audit-signup] notify failed: ${error.message}`));
  }

  return { ok: true, id: signup.id };
}

module.exports = {
  AUDIT_COUNTIES,
  BLOCK_ACRES_MIN,
  BLOCK_ACRES_MAX,
  buildSignup,
  recordAuditSignup,
  redactEmail,
  validate
};
