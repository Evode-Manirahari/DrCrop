const { spawn, spawnSync } = require("child_process");

function hasGBrain() {
  if (process.env.DRCROP_GBRAIN === "0") {
    return {
      available: false,
      disabled: true,
      version: null,
      error: null
    };
  }

  const result = spawnSync("gbrain", ["version"], {
    encoding: "utf8",
    timeout: 1800
  });
  return {
    available: result.status === 0,
    disabled: false,
    version: result.status === 0 ? result.stdout.trim() : null,
    error: result.error?.message || result.stderr?.trim() || null
  };
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function putArgs(slug, content) {
  return ["put", slug, "--content", content];
}

function linkArgs(from, to, type) {
  return ["link", from, to, "--link-type", type];
}

function runGBrain(args, input, timeoutMs = 2600) {
  return new Promise((resolve) => {
    const child = spawn("gbrain", args, {
      stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CODEX_SANDBOX_NETWORK_DISABLED: process.env.CODEX_SANDBOX_NETWORK_DISABLED || "1"
      }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        resolve({
          ok: false,
          args,
          stdout,
          stderr,
          timedOut: true,
          error: `gbrain ${args.join(" ")} timed out after ${timeoutMs}ms`
        });
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, args, stdout, stderr, error: error.message });
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: code === 0, code, args, stdout, stderr });
      }
    });
    if (input) child.stdin.end(input);
  });
}

function observationSlug(observation) {
  return `drcrop/observations/${slugify(observation.id)}`;
}

function entityPage(slug, title, body, tags) {
  return `---
type: drcrop_entity
tags: [drcrop, ${tags.map(slugify).filter(Boolean).join(", ")}]
---
# ${title}

${body}
`;
}

function observationPage(observation, analysis) {
  const relatedLines = (analysis.related || [])
    .map((item) => `- [[drcrop/observations/${slugify(item.observationId)}]] ${item.score}/100: ${item.reasons.join(", ")}`)
    .join("\n");

  return `---
type: drcrop_observation
field: ${observation.fieldId}
crop: ${observation.crop}
issue: ${observation.issue}
severity: ${observation.severity}
reported_at: ${observation.reportedAt}
tags: [drcrop, crop-memory, ${slugify(observation.crop)}, ${slugify(observation.issue)}]
---
# ${observation.fieldName} ${observation.issue}

## Observation
- Field: [[drcrop/fields/${slugify(observation.fieldName)}]]
- Zone: ${observation.zoneName}
- Crop: [[drcrop/crops/${slugify(observation.crop)}]]
- Issue: [[drcrop/issues/${slugify(observation.issue)}]]
- Severity: ${observation.severity}/5
- Affected acres: ${observation.acres}
- Symptoms: ${observation.symptoms}

## Agent assessment
- Risk: ${analysis.riskLevel}
- Confidence: ${analysis.confidence}%
- Targeted treatment acres: ${analysis.treatmentAcres}
- Blanket spray acres avoided: ${analysis.avoidedAcres}

## Recommended action
${analysis.recommendations.map((item) => `- ${item}`).join("\n")}

## Related memory
${relatedLines || "- No related outbreak memory crossed the relationship threshold."}
`;
}

async function recordObservation(observation, analysis) {
  if (process.env.DRCROP_GBRAIN === "0") {
    return { enabled: false, ok: false, operations: [], errors: ["DRCROP_GBRAIN=0"] };
  }

  const status = hasGBrain();
  if (!status.available) {
    return { enabled: false, ok: false, operations: [], errors: [status.error || "gbrain CLI unavailable"] };
  }

  const operations = [];
  const errors = [];
  const fieldSlug = `drcrop/fields/${slugify(observation.fieldName)}`;
  const cropSlug = `drcrop/crops/${slugify(observation.crop)}`;
  const issueSlug = `drcrop/issues/${slugify(observation.issue)}`;
  const obsSlug = observationSlug(observation);
  const pages = [
    [fieldSlug, entityPage(fieldSlug, observation.fieldName, `${observation.crop} block in DrCrop memory.`, ["field", observation.crop])],
    [cropSlug, entityPage(cropSlug, observation.crop, "Crop entity tracked by DrCrop.", ["crop", observation.crop])],
    [issueSlug, entityPage(issueSlug, observation.issue, "Pest or symptom entity tracked by DrCrop.", ["issue", observation.issue])],
    [obsSlug, observationPage(observation, analysis)]
  ];

  for (const related of analysis.related || []) {
    pages.push([
      `drcrop/observations/${slugify(related.observationId)}`,
      entityPage(
        `drcrop/observations/${slugify(related.observationId)}`,
        `${related.fieldName} ${related.issue}`,
        `Related DrCrop memory stub for ${related.zoneName}. Relationship reasons: ${related.reasons.join(", ")}.`,
        ["observation", related.issue]
      )
    ]);
  }

  for (const [slug, content] of pages) {
    const result = await runGBrain(putArgs(slug, content));
    operations.push({ command: `gbrain put ${slug} --content <markdown>`, ok: result.ok, timedOut: result.timedOut || false });
    if (!result.ok) errors.push(result.error || result.stderr || `failed to put ${slug}`);
  }

  const links = [
    [obsSlug, fieldSlug, "reported_in"],
    [obsSlug, cropSlug, "affects_crop"],
    [obsSlug, issueSlug, "detected_issue"]
  ];

  for (const related of analysis.related || []) {
    links.push([obsSlug, `drcrop/observations/${slugify(related.observationId)}`, "possibly_related_to"]);
  }

  for (const [from, to, type] of links) {
    const result = await runGBrain(linkArgs(from, to, type));
    operations.push({ command: `gbrain link ${from} ${to} --link-type ${type}`, ok: result.ok, timedOut: result.timedOut || false });
    if (!result.ok) errors.push(result.error || result.stderr || `failed to link ${from} -> ${to}`);
  }

  return {
    enabled: true,
    ok: errors.length === 0,
    version: status.version,
    observationSlug: obsSlug,
    operations,
    errors: errors.slice(0, 5)
  };
}

async function searchMemory(query) {
  const status = hasGBrain();
  if (!status.available) return { ok: false, error: status.error || "gbrain CLI unavailable" };
  const result = await runGBrain(["search", query], null, 3000);
  return {
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut || false,
    error: result.error
  };
}

module.exports = {
  hasGBrain,
  recordObservation,
  searchMemory,
  putArgs,
  linkArgs,
  slugify
};
