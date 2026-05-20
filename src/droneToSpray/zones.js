"use strict";

const { rectanglePolygon, pixelsToAcres } = require("./geo");

const DEFAULT_THRESHOLDS = {
  // Inter-row weed-pixel fraction above which a cell becomes...
  spray: 0.55,    // red
  scout: 0.25     // yellow (below scout → green skip)
};

// Rough vineyard herbicide economics (under-vine pass, NorCal). These
// are demo-grade defaults; per-customer rates override at sale time.
const DEFAULT_ECONOMICS = {
  herbicideCostPerAcre: 38,           // USD per pass
  herbicideOuncesPerAcre: 32,         // product oz per pass
  scoutSkipProbability: 0.5           // half of scout zones end up skipped on follow-up
};

function classifyDensity(density, thresholds = DEFAULT_THRESHOLDS) {
  if (density >= thresholds.spray) return "spray";
  if (density >= thresholds.scout) return "scout";
  return "skip";
}

const RECOMMENDATION_LABEL = {
  spray: "Spray — confirmed weed pressure",
  scout: "Scout — borderline pressure, ground-truth first",
  skip: "Skip — no meaningful weed signal"
};

/**
 * Compute prescription zones from a vegetation mask + inter-row mask.
 *
 * @param {Object} params
 * @param {Uint8Array} params.vegetationMask  1 = green pixel
 * @param {Uint8Array} params.interRowMask    1 = inter-row pixel (where weeds matter)
 * @param {number} params.width
 * @param {number} params.height
 * @param {number} params.gridCells           number of cells along each axis
 * @param {Object} params.transform           geo transform from geo.js
 * @param {Object} [params.thresholds]
 * @param {Object} [params.economics]
 * @returns {{ zones, summary }}
 */
function computeZones({
  vegetationMask,
  interRowMask,
  width,
  height,
  gridCells,
  transform,
  thresholds = DEFAULT_THRESHOLDS,
  economics = DEFAULT_ECONOMICS
}) {
  const cellWidthPx = width / gridCells;
  const cellHeightPx = height / gridCells;

  const zones = [];
  for (let gy = 0; gy < gridCells; gy += 1) {
    for (let gx = 0; gx < gridCells; gx += 1) {
      const x0 = Math.floor(gx * cellWidthPx);
      const y0 = Math.floor(gy * cellHeightPx);
      const x1 = Math.floor((gx + 1) * cellWidthPx);
      const y1 = Math.floor((gy + 1) * cellHeightPx);

      let interRowPixels = 0;
      let weedPixels = 0;
      for (let y = y0; y < y1; y += 1) {
        const rowOffset = y * width;
        for (let x = x0; x < x1; x += 1) {
          const idx = rowOffset + x;
          if (interRowMask[idx]) {
            interRowPixels += 1;
            if (vegetationMask[idx]) weedPixels += 1;
          }
        }
      }
      const density = interRowPixels > 0 ? weedPixels / interRowPixels : 0;
      const recommendation = classifyDensity(density, thresholds);

      const wPx = x1 - x0;
      const hPx = y1 - y0;
      const polygon = rectanglePolygon(transform, x0, y0, wPx, hPx);
      const acres = pixelsToAcres(wPx * hPx, transform);

      let chemicalSavedAcres = 0;
      if (recommendation === "skip") chemicalSavedAcres = acres;
      else if (recommendation === "scout") chemicalSavedAcres = acres * economics.scoutSkipProbability;

      zones.push({
        id: `zone-${gy}-${gx}`,
        gx,
        gy,
        pixelBounds: { x: x0, y: y0, width: wPx, height: hPx },
        polygon,
        density: Number(density.toFixed(4)),
        recommendation,
        recommendationLabel: RECOMMENDATION_LABEL[recommendation],
        acres: Number(acres.toFixed(3)),
        chemicalSavedAcres: Number(chemicalSavedAcres.toFixed(3)),
        estimatedSavingsUsd: Number((chemicalSavedAcres * economics.herbicideCostPerAcre).toFixed(2)),
        estimatedSavingsOunces: Number((chemicalSavedAcres * economics.herbicideOuncesPerAcre).toFixed(2))
      });
    }
  }

  const summary = summarizeZones(zones);
  return { zones, summary, thresholds, economics };
}

function summarizeZones(zones) {
  const summary = {
    totalAcres: 0,
    sprayAcres: 0,
    scoutAcres: 0,
    skipAcres: 0,
    estimatedSavingsUsd: 0,
    estimatedSavingsOunces: 0,
    sprayCount: 0,
    scoutCount: 0,
    skipCount: 0
  };
  for (const zone of zones) {
    summary.totalAcres += zone.acres;
    summary.estimatedSavingsUsd += zone.estimatedSavingsUsd;
    summary.estimatedSavingsOunces += zone.estimatedSavingsOunces;
    if (zone.recommendation === "spray") {
      summary.sprayAcres += zone.acres;
      summary.sprayCount += 1;
    } else if (zone.recommendation === "scout") {
      summary.scoutAcres += zone.acres;
      summary.scoutCount += 1;
    } else {
      summary.skipAcres += zone.acres;
      summary.skipCount += 1;
    }
  }
  for (const key of ["totalAcres", "sprayAcres", "scoutAcres", "skipAcres", "estimatedSavingsUsd", "estimatedSavingsOunces"]) {
    summary[key] = Number(summary[key].toFixed(3));
  }
  summary.sprayedAcresAvoidedPct = summary.totalAcres > 0
    ? Number(((summary.skipAcres + summary.scoutAcres * 0.5) / summary.totalAcres * 100).toFixed(1))
    : 0;
  return summary;
}

module.exports = { computeZones, classifyDensity, summarizeZones, DEFAULT_THRESHOLDS, DEFAULT_ECONOMICS };
