"use strict";

const TINT = {
  spray: [214, 39, 40],
  scout: [247, 181, 0],
  skip: [44, 160, 44]
};

/**
 * Returns a new Buffer with the original ortho tinted by each zone's
 * recommendation. Pure data — no PNG encoding. Used by the PDF export
 * and (optionally) the web preview.
 */
function renderZonedOverlay({ pixels, width, height, zones, alpha = 0.35 }) {
  const out = Buffer.from(pixels);
  const a = Math.max(0, Math.min(1, alpha));
  const invA = 1 - a;

  for (const zone of zones) {
    const tint = TINT[zone.recommendation];
    if (!tint) continue;
    const { x, y, width: w, height: h } = zone.pixelBounds;
    const x1 = x + w;
    const y1 = y + h;
    for (let yy = y; yy < y1; yy += 1) {
      const rowOffset = yy * width * 3;
      for (let xx = x; xx < x1; xx += 1) {
        const o = rowOffset + xx * 3;
        out[o]     = Math.round(out[o] * invA + tint[0] * a);
        out[o + 1] = Math.round(out[o + 1] * invA + tint[1] * a);
        out[o + 2] = Math.round(out[o + 2] * invA + tint[2] * a);
      }

      // Outline: draw a 1-px ring at the zone boundary.
      if (yy === y || yy === y1 - 1) {
        for (let xx = x; xx < x1; xx += 1) {
          const o = rowOffset + xx * 3;
          out[o] = tint[0];
          out[o + 1] = tint[1];
          out[o + 2] = tint[2];
        }
      } else {
        const left = rowOffset + x * 3;
        const right = rowOffset + (x1 - 1) * 3;
        out[left] = tint[0]; out[left + 1] = tint[1]; out[left + 2] = tint[2];
        out[right] = tint[0]; out[right + 1] = tint[1]; out[right + 2] = tint[2];
      }
    }
  }
  return out;
}

module.exports = { renderZonedOverlay, TINT };
