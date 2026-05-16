const test = require("node:test");
const assert = require("node:assert/strict");

const { buildActionPlan, buildGraph, distanceMiles } = require("../src/riskEngine");
const farm = require("../data/farm.json");
const seedObservations = require("../data/observations.json");

test("connects nearby aphids and leaf curling into a targeted plan", () => {
  const report = {
    id: "obs-test-beta",
    fieldId: "field-beta",
    fieldName: "Field Beta",
    zoneName: "B1 west rows",
    crop: "Strawberry",
    issue: "Leaf curling",
    symptoms: "Curling leaves and honeydew on new growth.",
    severity: 4,
    acres: 1.6,
    reportedAt: "2026-05-16T12:15:00.000Z",
    windDirectionDeg: 225,
    status: "active"
  };

  const plan = buildActionPlan(report, [...seedObservations, report], farm.fields, {
    totalAcres: farm.totalAcres
  });

  assert.equal(plan.riskLevel, "critical");
  assert.ok(plan.confidence >= 80);
  assert.ok(plan.avoidedAcres > 70);
  assert.ok(plan.related.some((item) => item.observationId === "obs-20260516-alpha-aphid"));
  assert.match(plan.recommendations.join(" "), /biological/i);
  assert.match(plan.recommendations.join(" "), /threshold/i);
});

test("distance calculation stays in a plausible farm range", () => {
  const alpha = farm.fields.find((field) => field.id === "field-alpha");
  const beta = farm.fields.find((field) => field.id === "field-beta");

  const miles = distanceMiles(alpha.centroid, beta.centroid);

  assert.ok(miles > 0.4);
  assert.ok(miles < 0.8);
});

test("builds field, issue, observation, and relationship graph nodes", () => {
  const graph = buildGraph(seedObservations, farm.fields);

  assert.ok(graph.nodes.some((node) => node.id === "field-alpha"));
  assert.ok(graph.nodes.some((node) => node.id === "issue-aphids"));
  assert.ok(graph.edges.some((edge) => edge.type === "reported_in"));
  assert.ok(graph.edges.some((edge) => edge.type === "detected"));
});
