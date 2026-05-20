"use strict";

const crypto = require("crypto");

const MAX_FLIGHTS = 8;
const flights = new Map(); // id -> flight record

function newId() {
  return `flight-${crypto.randomBytes(4).toString("hex")}`;
}

function saveFlight(record) {
  flights.set(record.id, record);
  while (flights.size > MAX_FLIGHTS) {
    const oldest = flights.keys().next().value;
    if (oldest === undefined) break;
    flights.delete(oldest);
  }
  return record;
}

function getFlight(id) {
  return flights.get(id) || null;
}

function listFlights() {
  return [...flights.values()].map((f) => ({
    id: f.id,
    blockName: f.blockName,
    capturedAt: f.capturedAt,
    source: f.source,
    summary: f.prescription?.summary,
    width: f.width,
    height: f.height,
    pixelSizeMeters: f.transform?.pixelSizeMeters
  })).sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
}

function clear() {
  flights.clear();
}

module.exports = { newId, saveFlight, getFlight, listFlights, clear };
