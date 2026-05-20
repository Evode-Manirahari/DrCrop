"use strict";

const { mulberry32 } = require("./rng");
const { buildGeoTransform, boundaryPolygon } = require("./geo");

const DEFAULTS = {
  width: 600,
  height: 600,
  pixelSizeMeters: 0.25,    // 25 cm/pixel → 150m × 150m field
  rowSpacingPx: 10,         // ~2.5 m
  canopyWidthPx: 2,         // ~0.5 m of vine canopy
  gridCells: 6,             // 6×6 = 36 management cells, each 25m × 25m
  originLat: 38.3024,       // Sonoma County, CA vineyard country
  originLon: -122.5102,
  blockName: "Block A — North"
};

const SOIL = [130, 95, 60];
const CANOPY = [35, 75, 30];
const WEED = [75, 135, 55];
const CANOPY_SHADOW = [18, 45, 18];

function clamp255(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function jitter(rgb, rand, amount) {
  return [
    clamp255(rgb[0] + (rand() - 0.5) * amount),
    clamp255(rgb[1] + (rand() - 0.5) * amount),
    clamp255(rgb[2] + (rand() - 0.5) * amount)
  ];
}

function buildWeedDensityGrid(gridCells, rand) {
  // A semi-realistic pattern: heavy weed pressure in lower-right corner,
  // a moderate band across the middle, mostly clean elsewhere. Hand-tuned
  // so the pipeline can find a clear red / yellow / green split.
  const base = [
    [0.05, 0.10, 0.15, 0.10, 0.05, 0.05],
    [0.10, 0.20, 0.35, 0.25, 0.15, 0.05],
    [0.15, 0.40, 0.55, 0.45, 0.30, 0.10],
    [0.10, 0.30, 0.50, 0.70, 0.55, 0.25],
    [0.05, 0.15, 0.35, 0.75, 0.85, 0.50],
    [0.05, 0.10, 0.20, 0.55, 0.80, 0.75]
  ];
  const grid = [];
  for (let gy = 0; gy < gridCells; gy += 1) {
    const row = [];
    for (let gx = 0; gx < gridCells; gx += 1) {
      const baseValue = base[gy] ? base[gy][gx] ?? 0 : 0;
      const noisy = baseValue + (rand() - 0.5) * 0.08;
      row.push(Math.max(0, Math.min(1, noisy)));
    }
    grid.push(row);
  }
  return grid;
}

function densityToRecommendation(density) {
  if (density >= 0.55) return "spray";
  if (density >= 0.25) return "scout";
  return "skip";
}

/**
 * Synthesize a vineyard orthomosaic.
 *
 * Returns:
 *   pixels        — Buffer of raw RGB bytes, length width*height*3
 *   width, height — dimensions in pixels
 *   transform     — pixel ↔ lng/lat geo transform
 *   rowSpacingPx, canopyWidthPx — row geometry used to render
 *   weedDensityGrid — ground-truth per management cell (rows × cols)
 *   gridCells     — number of cells along each axis
 *   boundary      — closed polygon of the field boundary in lng/lat
 *   blockName     — human label for the block
 *   pixelSizeMeters — pixel resolution
 */
function generateSyntheticOrtho(options = {}) {
  const opts = { ...DEFAULTS };
  for (const key of Object.keys(options)) {
    if (options[key] !== undefined) opts[key] = options[key];
  }
  const seed = Number.isFinite(opts.seed) ? opts.seed : 0xc0ffee;
  const rand = mulberry32(seed);

  const { width, height, rowSpacingPx, canopyWidthPx, gridCells } = opts;
  const cellWidth = width / gridCells;
  const cellHeight = height / gridCells;
  const weedDensityGrid = buildWeedDensityGrid(gridCells, rand);

  const pixels = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const phase = x % rowSpacingPx;
      const inCanopy = phase < canopyWidthPx;
      const onEdge = phase === canopyWidthPx;

      let rgb;
      if (inCanopy) {
        rgb = jitter(CANOPY, rand, 18);
      } else if (onEdge) {
        rgb = jitter(CANOPY_SHADOW, rand, 12);
      } else {
        const gx = Math.min(gridCells - 1, Math.floor(x / cellWidth));
        const gy = Math.min(gridCells - 1, Math.floor(y / cellHeight));
        const density = weedDensityGrid[gy][gx];
        if (rand() < density) {
          rgb = jitter(WEED, rand, 22);
        } else {
          rgb = jitter(SOIL, rand, 20);
        }
      }
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
    }
  }

  const transform = buildGeoTransform({
    originLat: opts.originLat,
    originLon: opts.originLon,
    pixelSizeMeters: opts.pixelSizeMeters,
    width,
    height
  });

  const groundTruthZones = [];
  for (let gy = 0; gy < gridCells; gy += 1) {
    for (let gx = 0; gx < gridCells; gx += 1) {
      const density = weedDensityGrid[gy][gx];
      groundTruthZones.push({
        gx,
        gy,
        density,
        recommendation: densityToRecommendation(density)
      });
    }
  }

  return {
    pixels,
    width,
    height,
    transform,
    rowSpacingPx,
    canopyWidthPx,
    gridCells,
    weedDensityGrid,
    groundTruthZones,
    boundary: boundaryPolygon(transform),
    blockName: opts.blockName,
    pixelSizeMeters: opts.pixelSizeMeters,
    seed
  };
}

module.exports = { generateSyntheticOrtho };
