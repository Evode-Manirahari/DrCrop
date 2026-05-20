"use strict";

const { computeExG, thresholdExG } = require("./vegetationIndex");
const { buildInterRowMask } = require("./rowMask");
const { computeZones } = require("./zones");

/**
 * Run the full intake-to-prescription pipeline on a raw RGB ortho.
 *
 * @param {Object} input
 * @param {Buffer} input.pixels
 * @param {number} input.width
 * @param {number} input.height
 * @param {Object} input.transform           geo transform (see geo.js)
 * @param {Object} input.rowGeometry         { rowSpacingPx, canopyWidthPx }
 * @param {number} [input.gridCells=6]
 * @param {number} [input.exgThreshold=20]
 * @param {Object} [input.thresholds]
 * @param {Object} [input.economics]
 * @returns {Object} prescription
 */
function runPipeline(input) {
  const {
    pixels,
    width,
    height,
    transform,
    rowGeometry,
    gridCells = 6,
    exgThreshold = 20,
    thresholds,
    economics
  } = input;

  const exg = computeExG(pixels, width, height);
  const vegetationMask = thresholdExG(exg, exgThreshold);
  const interRowMask = buildInterRowMask({
    width,
    height,
    rowSpacingPx: rowGeometry.rowSpacingPx,
    canopyWidthPx: rowGeometry.canopyWidthPx
  });

  const { zones, summary, thresholds: usedThresholds, economics: usedEconomics } = computeZones({
    vegetationMask,
    interRowMask,
    width,
    height,
    gridCells,
    transform,
    thresholds,
    economics
  });

  return {
    zones,
    summary,
    thresholds: usedThresholds,
    economics: usedEconomics,
    exgThreshold,
    gridCells,
    pipeline: {
      vegetationMaskPixels: countOnes(vegetationMask),
      interRowMaskPixels: countOnes(interRowMask)
    }
  };
}

function countOnes(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) n += mask[i];
  return n;
}

/**
 * Diff two prescriptions captured before/after a spray pass. Same
 * geometry assumed (same flight area, same grid). Returns per-zone
 * change records + delta summary.
 */
function diffPrescriptions(before, after) {
  const beforeById = new Map(before.zones.map((z) => [z.id, z]));
  const changes = [];
  for (const a of after.zones) {
    const b = beforeById.get(a.id);
    if (!b) continue;
    changes.push({
      id: a.id,
      before: { recommendation: b.recommendation, density: b.density },
      after: { recommendation: a.recommendation, density: a.density },
      densityDelta: Number((a.density - b.density).toFixed(4)),
      improved: a.density < b.density
    });
  }
  const improved = changes.filter((c) => c.improved).length;
  const regressed = changes.filter((c) => !c.improved && c.densityDelta > 0.05).length;
  const acresSpared = before.summary.skipAcres - after.summary.skipAcres < 0
    ? Math.abs(before.summary.skipAcres - after.summary.skipAcres)
    : 0;
  return {
    changes,
    summary: {
      zonesImproved: improved,
      zonesRegressed: regressed,
      sprayedAcresAvoidedPctBefore: before.summary.sprayedAcresAvoidedPct,
      sprayedAcresAvoidedPctAfter: after.summary.sprayedAcresAvoidedPct,
      estimatedSavingsUsdBefore: before.summary.estimatedSavingsUsd,
      estimatedSavingsUsdAfter: after.summary.estimatedSavingsUsd,
      acresSpared: Number(acresSpared.toFixed(3))
    }
  };
}

module.exports = { runPipeline, diffPrescriptions };
