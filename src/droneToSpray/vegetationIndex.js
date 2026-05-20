"use strict";

/**
 * Excess Green (ExG) vegetation index for RGB orthos.
 *
 *   ExG(r,g,b) = 2*g - r - b
 *
 * Woebbecke et al. 1995; widely used as a cheap stand-in for NDVI when
 * NIR isn't available, which is the common case for off-the-shelf
 * RGB drones (DJI Mavic 3, Phantom 4, etc.).
 *
 * Returns Int16Array of length width*height. Negative values indicate
 * non-vegetation (soil/shadow); positive values indicate green.
 */
function computeExG(pixels, width, height) {
  const out = new Int16Array(width * height);
  for (let i = 0, j = 0; j < out.length; i += 3, j += 1) {
    out[j] = 2 * pixels[i + 1] - pixels[i] - pixels[i + 2];
  }
  return out;
}

/**
 * Threshold ExG into a binary vegetation mask. Returns Uint8Array
 * where 1 = vegetation, 0 = not. Threshold of 20 is a common starting
 * point on the 0–255 RGB scale; tune per camera/lighting.
 */
function thresholdExG(exg, threshold = 20) {
  const mask = new Uint8Array(exg.length);
  for (let i = 0; i < exg.length; i += 1) {
    mask[i] = exg[i] >= threshold ? 1 : 0;
  }
  return mask;
}

module.exports = { computeExG, thresholdExG };
