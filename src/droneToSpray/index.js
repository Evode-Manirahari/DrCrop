"use strict";

const { generateSyntheticOrtho } = require("./syntheticOrtho");
const { runPipeline, diffPrescriptions } = require("./pipeline");
const { renderZonedOverlay } = require("./overlay");
const { encodeRGB } = require("./png");
const { buildFeatureCollection } = require("./exportGeoJson");
const { buildKml } = require("./exportKml");
const { buildPdf } = require("./exportPdf");
const flightStore = require("./flightStore");

function nowIso() {
  return new Date().toISOString();
}

/**
 * Generate a synthetic vineyard flight and run the prescription pipeline.
 * Stores the flight + prescription in the flight store and returns
 * the flight ID + summary payload (no raw pixels — those are served
 * separately via the ortho/PNG endpoint).
 */
function createSyntheticFlight(options = {}) {
  const ortho = generateSyntheticOrtho(options);
  const prescription = runPipeline({
    pixels: ortho.pixels,
    width: ortho.width,
    height: ortho.height,
    transform: ortho.transform,
    rowGeometry: { rowSpacingPx: ortho.rowSpacingPx, canopyWidthPx: ortho.canopyWidthPx },
    gridCells: ortho.gridCells
  });

  const id = flightStore.newId();
  const record = {
    id,
    source: "synthetic",
    blockName: ortho.blockName,
    capturedAt: nowIso(),
    pixels: ortho.pixels,
    width: ortho.width,
    height: ortho.height,
    transform: ortho.transform,
    rowGeometry: { rowSpacingPx: ortho.rowSpacingPx, canopyWidthPx: ortho.canopyWidthPx },
    boundary: ortho.boundary,
    groundTruth: {
      weedDensityGrid: ortho.weedDensityGrid,
      zones: ortho.groundTruthZones,
      seed: ortho.seed
    },
    prescription
  };
  flightStore.saveFlight(record);
  return record;
}

function publicView(record) {
  if (!record) return null;
  return {
    id: record.id,
    source: record.source,
    blockName: record.blockName,
    capturedAt: record.capturedAt,
    width: record.width,
    height: record.height,
    pixelSizeMeters: record.transform.pixelSizeMeters,
    transform: {
      originLat: record.transform.originLat,
      originLon: record.transform.originLon,
      pixelSizeMeters: record.transform.pixelSizeMeters,
      width: record.transform.width,
      height: record.transform.height
    },
    rowGeometry: record.rowGeometry,
    boundary: record.boundary,
    prescription: record.prescription,
    groundTruth: record.source === "synthetic" ? record.groundTruth : undefined,
    exports: {
      orthoPng: `/api/drone/flight/${record.id}/ortho.png`,
      overlayPng: `/api/drone/flight/${record.id}/overlay.png`,
      pdf: `/api/drone/flight/${record.id}/export/pdf`,
      kml: `/api/drone/flight/${record.id}/export/kml`,
      geojson: `/api/drone/flight/${record.id}/export/geojson`
    }
  };
}

function renderOrthoPng(record) {
  return encodeRGB(record.pixels, record.width, record.height);
}

function renderOverlayPng(record) {
  const overlay = renderZonedOverlay({
    pixels: record.pixels,
    width: record.width,
    height: record.height,
    zones: record.prescription.zones
  });
  return encodeRGB(overlay, record.width, record.height);
}

function renderPdf(record) {
  const overlay = renderZonedOverlay({
    pixels: record.pixels,
    width: record.width,
    height: record.height,
    zones: record.prescription.zones
  });
  return buildPdf({
    pixels: overlay,
    width: record.width,
    height: record.height,
    blockName: record.blockName,
    capturedAt: record.capturedAt,
    summary: record.prescription.summary,
    zones: record.prescription.zones
  });
}

function renderGeoJson(record) {
  return buildFeatureCollection({
    zones: record.prescription.zones,
    transform: record.transform,
    summary: record.prescription.summary,
    blockName: record.blockName,
    capturedAt: record.capturedAt,
    boundary: record.boundary
  });
}

function renderKml(record) {
  return buildKml({
    zones: record.prescription.zones,
    boundary: record.boundary,
    blockName: record.blockName,
    capturedAt: record.capturedAt,
    summary: record.prescription.summary
  });
}

function verifyFlight(beforeId, afterId) {
  const before = flightStore.getFlight(beforeId);
  const after = flightStore.getFlight(afterId);
  if (!before || !after) return null;
  return {
    before: { id: before.id, capturedAt: before.capturedAt, summary: before.prescription.summary },
    after: { id: after.id, capturedAt: after.capturedAt, summary: after.prescription.summary },
    diff: diffPrescriptions(before.prescription, after.prescription)
  };
}

module.exports = {
  createSyntheticFlight,
  publicView,
  renderOrthoPng,
  renderOverlayPng,
  renderPdf,
  renderGeoJson,
  renderKml,
  verifyFlight,
  flightStore
};
