"use strict";

const RECOMMENDATION_COLOR = {
  spray: "#d62728",
  scout: "#f7b500",
  skip: "#2ca02c"
};

function buildFeatureCollection({ zones, transform, summary, blockName, capturedAt, boundary }) {
  const features = [];
  if (boundary) {
    features.push({
      type: "Feature",
      properties: {
        kind: "field-boundary",
        blockName: blockName || "Block",
        capturedAt: capturedAt || null
      },
      geometry: { type: "Polygon", coordinates: [boundary] }
    });
  }
  for (const zone of zones) {
    features.push({
      type: "Feature",
      properties: {
        kind: "prescription-zone",
        zoneId: zone.id,
        recommendation: zone.recommendation,
        recommendationLabel: zone.recommendationLabel,
        weedDensity: zone.density,
        acres: zone.acres,
        estimatedSavingsUsd: zone.estimatedSavingsUsd,
        estimatedSavingsOunces: zone.estimatedSavingsOunces,
        chemicalSavedAcres: zone.chemicalSavedAcres,
        color: RECOMMENDATION_COLOR[zone.recommendation]
      },
      geometry: { type: "Polygon", coordinates: [zone.polygon] }
    });
  }
  return {
    type: "FeatureCollection",
    properties: {
      generator: "DrCrop drone-to-spray",
      blockName: blockName || "Block",
      capturedAt: capturedAt || null,
      summary
    },
    features
  };
}

module.exports = { buildFeatureCollection };
