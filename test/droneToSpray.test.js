const test = require("node:test");
const assert = require("node:assert/strict");

const { generateSyntheticOrtho } = require("../src/droneToSpray/syntheticOrtho");
const { computeExG, thresholdExG } = require("../src/droneToSpray/vegetationIndex");
const { buildInterRowMask } = require("../src/droneToSpray/rowMask");
const { runPipeline, diffPrescriptions } = require("../src/droneToSpray/pipeline");
const { buildFeatureCollection } = require("../src/droneToSpray/exportGeoJson");
const { buildKml } = require("../src/droneToSpray/exportKml");
const { buildPdf } = require("../src/droneToSpray/exportPdf");
const { encodeRGB } = require("../src/droneToSpray/png");
const drone = require("../src/droneToSpray");

test("ExG identifies green pixels and ignores soil", () => {
  const pixels = Buffer.from([
    130, 95, 60,    // soil
    35, 75, 30,     // vine canopy (very green)
    75, 135, 55,    // weed (very green)
    200, 200, 200   // bright neutral
  ]);
  const exg = computeExG(pixels, 4, 1);
  const mask = thresholdExG(exg, 20);
  assert.equal(mask[0], 0, "soil should not pass threshold");
  assert.equal(mask[1], 1, "vine canopy should pass threshold");
  assert.equal(mask[2], 1, "weed should pass threshold");
  assert.equal(mask[3], 0, "neutral gray should not pass threshold");
});

test("inter-row mask marks columns between canopy strips", () => {
  const mask = buildInterRowMask({
    width: 10,
    height: 1,
    rowSpacingPx: 10,
    canopyWidthPx: 2,
    edgePaddingPx: 1
  });
  assert.equal(mask[0], 0, "canopy");
  assert.equal(mask[1], 0, "canopy");
  assert.equal(mask[2], 0, "edge padding");
  assert.equal(mask[3], 1, "inter-row");
  assert.equal(mask[9], 1, "inter-row");
});

test("synthetic ortho generator is deterministic for a given seed", () => {
  const a = generateSyntheticOrtho({ seed: 42 });
  const b = generateSyntheticOrtho({ seed: 42 });
  assert.equal(Buffer.compare(a.pixels, b.pixels), 0, "same seed → identical pixels");
});

test("pipeline recovers the ground-truth red/green pattern on synthetic ortho", () => {
  const ortho = generateSyntheticOrtho({ seed: 0xc0ffee });
  const prescription = runPipeline({
    pixels: ortho.pixels,
    width: ortho.width,
    height: ortho.height,
    transform: ortho.transform,
    rowGeometry: { rowSpacingPx: ortho.rowSpacingPx, canopyWidthPx: ortho.canopyWidthPx },
    gridCells: ortho.gridCells
  });

  // Sanity: 6x6 cells = 36 zones.
  assert.equal(prescription.zones.length, 36);

  // Top-left cell (ground truth ~0.05) should be skip.
  const topLeft = prescription.zones.find((z) => z.gx === 0 && z.gy === 0);
  assert.equal(topLeft.recommendation, "skip", `top-left density was ${topLeft.density}`);

  // Bottom-right corner (ground truth ~0.75) should be spray.
  const bottomRight = prescription.zones.find((z) => z.gx === 5 && z.gy === 5);
  assert.equal(bottomRight.recommendation, "spray", `bottom-right density was ${bottomRight.density}`);

  // Overall summary should record meaningful skip acres.
  assert.ok(prescription.summary.skipAcres > 0, "should find skippable acres");
  assert.ok(prescription.summary.estimatedSavingsUsd > 0, "should compute non-zero savings");
  assert.ok(prescription.summary.totalAcres > 4, "5-acre field should round above 4 acres");
});

test("pipeline matches ground truth on a clear majority of cells", () => {
  const ortho = generateSyntheticOrtho({ seed: 0xc0ffee });
  const prescription = runPipeline({
    pixels: ortho.pixels,
    width: ortho.width,
    height: ortho.height,
    transform: ortho.transform,
    rowGeometry: { rowSpacingPx: ortho.rowSpacingPx, canopyWidthPx: ortho.canopyWidthPx },
    gridCells: ortho.gridCells
  });
  const truthById = new Map();
  for (const gt of ortho.groundTruthZones) truthById.set(`${gt.gy}-${gt.gx}`, gt.recommendation);
  let matches = 0;
  for (const z of prescription.zones) {
    if (truthById.get(`${z.gy}-${z.gx}`) === z.recommendation) matches += 1;
  }
  assert.ok(matches >= 28, `expected at least 28/36 cells to match ground truth, got ${matches}`);
});

test("exports produce parseable GeoJSON / KML / PDF", () => {
  const record = drone.createSyntheticFlight({ seed: 1 });

  const fc = drone.renderGeoJson(record);
  assert.equal(fc.type, "FeatureCollection");
  assert.ok(fc.features.length > 30, "geojson should have boundary + zones");
  const recs = new Set(fc.features.map((f) => f.properties.recommendation).filter(Boolean));
  assert.ok(recs.size >= 2, "expected at least two recommendation classes");

  const kml = drone.renderKml(record);
  assert.match(kml, /<kml/);
  assert.match(kml, /<Placemark>/);
  assert.match(kml, /drcrop-spray|drcrop-scout|drcrop-skip/);

  const pdf = drone.renderPdf(record);
  assert.ok(Buffer.isBuffer(pdf), "PDF should be a Buffer");
  const head = pdf.subarray(0, 8).toString("latin1");
  assert.match(head, /^%PDF-1\.4/);
  const tail = pdf.subarray(pdf.length - 6).toString("latin1");
  assert.match(tail, /%%EOF/);
});

test("PNG encoder produces valid PNG signature", () => {
  const ortho = generateSyntheticOrtho({ seed: 7, width: 32, height: 32 });
  const png = encodeRGB(ortho.pixels, ortho.width, ortho.height);
  const expectedSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(Buffer.compare(png.subarray(0, 8), expectedSig), 0);
  // IEND chunk: length 0, type "IEND", crc bytes at the very end.
  const tail = png.subarray(png.length - 12, png.length - 4).toString("latin1");
  assert.match(tail, /IEND/);
});

test("verify diff reports improvement when after-flight has cleaner zones", () => {
  const before = drone.createSyntheticFlight({ seed: 11 });
  // The "after" flight uses a different pattern by changing seed; this is a
  // proxy for a real before/after delta. We only assert the shape here.
  const after = drone.createSyntheticFlight({ seed: 12 });
  const result = drone.verifyFlight(before.id, after.id);
  assert.ok(result, "verify should return a result");
  assert.equal(result.before.id, before.id);
  assert.equal(result.after.id, after.id);
  assert.equal(typeof result.diff.summary.zonesImproved, "number");
  assert.ok(Array.isArray(result.diff.changes));
});

test("diffPrescriptions handles same-shape inputs directly", () => {
  const ortho = generateSyntheticOrtho({ seed: 99 });
  const baseline = runPipeline({
    pixels: ortho.pixels,
    width: ortho.width,
    height: ortho.height,
    transform: ortho.transform,
    rowGeometry: { rowSpacingPx: ortho.rowSpacingPx, canopyWidthPx: ortho.canopyWidthPx },
    gridCells: ortho.gridCells
  });
  const diff = diffPrescriptions(baseline, baseline);
  // Identical prescriptions should have zero regressions.
  assert.equal(diff.summary.zonesRegressed, 0);
  assert.equal(diff.changes.length, baseline.zones.length);
});
