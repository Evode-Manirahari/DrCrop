"use strict";

/**
 * Affine pixel <-> geographic coordinate transform for an orthomosaic.
 *
 * For an MVP we model an axis-aligned ortho:
 *   lon(x, y) = originLon + x * pixelSizeLonDeg
 *   lat(x, y) = originLat - y * pixelSizeLatDeg
 *
 * pixelSize{Lat,Lon}Deg is computed from a target pixel size in meters
 * at the field centroid latitude. This is a flat-Earth approximation
 * but is fine for sub-kilometer vineyard blocks.
 */

const METERS_PER_DEG_LAT = 111_320;

function buildGeoTransform({ originLat, originLon, pixelSizeMeters, width, height }) {
  const pixelSizeLatDeg = pixelSizeMeters / METERS_PER_DEG_LAT;
  const pixelSizeLonDeg = pixelSizeMeters / (METERS_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180));
  return {
    originLat,
    originLon,
    pixelSizeMeters,
    pixelSizeLatDeg,
    pixelSizeLonDeg,
    width,
    height,
    toLngLat(x, y) {
      return [originLon + x * pixelSizeLonDeg, originLat - y * pixelSizeLatDeg];
    }
  };
}

function pixelAreaSquareMeters(transform) {
  return transform.pixelSizeMeters * transform.pixelSizeMeters;
}

const SQM_PER_ACRE = 4046.8564224;

function pixelsToAcres(pixelCount, transform) {
  return (pixelCount * pixelAreaSquareMeters(transform)) / SQM_PER_ACRE;
}

function rectanglePolygon(transform, x, y, w, h) {
  const corners = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y]
  ];
  return corners.map(([px, py]) => transform.toLngLat(px, py));
}

function boundaryPolygon(transform) {
  return rectanglePolygon(transform, 0, 0, transform.width, transform.height);
}

module.exports = {
  buildGeoTransform,
  pixelsToAcres,
  pixelAreaSquareMeters,
  rectanglePolygon,
  boundaryPolygon,
  SQM_PER_ACRE
};
