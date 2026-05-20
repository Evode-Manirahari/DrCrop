"use strict";

/**
 * Row geometry mask for axis-aligned vineyard rows.
 *
 * Given known row spacing in pixels and canopy strip width, return a
 * Uint8Array of length width*height where:
 *   0 = canopy / under-vine / edge (ignore for weed detection)
 *   1 = inter-row (the strip where weeds matter)
 *
 * Real flights will need row detection — sum green per column, find the
 * dominant frequency via FFT or peak picking. We defer that to the
 * "real ortho" path; for the synthetic MVP the row geometry is passed
 * in from the generator.
 *
 * Assumes rows run vertically in the image (rowSpacingPx is the
 * horizontal period). Once we support rotated rows we'll add a
 * rotation/orientation step before this mask is computed.
 */
function buildInterRowMask({ width, height, rowSpacingPx, canopyWidthPx, edgePaddingPx = 1 }) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const phase = x % rowSpacingPx;
      const inCanopy = phase < canopyWidthPx + edgePaddingPx;
      mask[rowOffset + x] = inCanopy ? 0 : 1;
    }
  }
  return mask;
}

module.exports = { buildInterRowMask };
