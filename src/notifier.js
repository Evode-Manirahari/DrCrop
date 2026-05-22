// Email notifier for new audit signups. Opt-in — if RESEND_API_KEY is
// unset, this module no-ops and the redacted log line in auditSignup.js
// stays the only signal. Wire RESEND_API_KEY + DRCROP_LEAD_NOTIFY_EMAIL
// in Fly secrets to receive a real email per lead.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "DrCrop <onboarding@resend.dev>";

function status(env = process.env) {
  return {
    enabled: Boolean(env.RESEND_API_KEY && env.DRCROP_LEAD_NOTIFY_EMAIL),
    hasKey: Boolean(env.RESEND_API_KEY),
    hasRecipient: Boolean(env.DRCROP_LEAD_NOTIFY_EMAIL)
  };
}

function formatSubject(signup) {
  return `New audit signup: ${signup.vineyard} (${signup.county}, ${signup.blockAcres}ac)`;
}

function formatBody(signup) {
  const lines = [
    `Lead ${signup.id} received ${signup.receivedAt}`,
    "",
    `Name:        ${signup.name}`,
    `Role:        ${signup.role || "—"}`,
    `Vineyard:    ${signup.vineyard}`,
    `County:      ${signup.county}`,
    `Block acres: ${signup.blockAcres}`,
    `Email:       ${signup.email}`,
    `Phone:       ${signup.phone || "—"}`,
    `Fly window:  ${signup.flyWindow || "—"}`,
    "",
    `Current program:`,
    signup.herbicideProgram || "(blank)",
    "",
    `Notes:`,
    signup.notes || "(blank)",
    "",
    `User agent: ${signup.userAgent || "—"}`,
    "",
    `Stored in data/audit-signups.jsonl. Reply here once you've reached out.`
  ];
  return lines.join("\n");
}

function buildPayload(signup, env = process.env) {
  return {
    from: env.DRCROP_LEAD_NOTIFY_FROM || DEFAULT_FROM,
    to: [env.DRCROP_LEAD_NOTIFY_EMAIL],
    subject: formatSubject(signup),
    text: formatBody(signup),
    reply_to: signup.email
  };
}

async function notifyNewSignup(signup, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || globalThis.fetch;
  const logger = options.logger || console;
  const state = status(env);

  if (!state.enabled) {
    return { ok: true, sent: false, reason: "notifier-disabled" };
  }
  if (typeof fetchImpl !== "function") {
    return { ok: false, sent: false, reason: "fetch-unavailable" };
  }

  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.RESEND_API_KEY}`
      },
      body: JSON.stringify(buildPayload(signup, env))
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(`[notifier] Resend ${res.status} for ${signup.id}: ${text.slice(0, 200)}`);
      return { ok: false, sent: false, reason: `resend-${res.status}` };
    }
    return { ok: true, sent: true };
  } catch (error) {
    logger.warn(`[notifier] fetch failed for ${signup.id}: ${error.message}`);
    return { ok: false, sent: false, reason: "fetch-error" };
  }
}

module.exports = {
  buildPayload,
  formatBody,
  formatSubject,
  notifyNewSignup,
  status
};
