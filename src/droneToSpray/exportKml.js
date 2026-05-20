"use strict";

const STYLE_HEX = {
  // KML color is AABBGGRR. Use ~60% alpha for fill, full for outline.
  spray:  { fill: "996b16d6", line: "ffd62728" },  // red
  scout:  { fill: "9900b5f7", line: "fff7b500" },  // amber
  skip:   { fill: "992ca02c", line: "ff2ca02c" }   // green
};

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function polygonToKmlCoords(polygon) {
  return polygon.map(([lon, lat]) => `${lon.toFixed(8)},${lat.toFixed(8)},0`).join(" ");
}

function styleBlock(recommendation) {
  const colors = STYLE_HEX[recommendation] || STYLE_HEX.skip;
  return `    <Style id="drcrop-${recommendation}">
      <LineStyle><color>${colors.line}</color><width>2</width></LineStyle>
      <PolyStyle><color>${colors.fill}</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>`;
}

function placemarkForZone(zone) {
  const desc = [
    `Recommendation: ${zone.recommendationLabel}`,
    `Weed density: ${(zone.density * 100).toFixed(1)}%`,
    `Acres: ${zone.acres.toFixed(3)}`,
    `Estimated savings: $${zone.estimatedSavingsUsd.toFixed(2)} (${zone.estimatedSavingsOunces.toFixed(2)} oz product)`
  ].join("\n");
  return `    <Placemark>
      <name>${xmlEscape(zone.id)} — ${xmlEscape(zone.recommendation)}</name>
      <description>${xmlEscape(desc)}</description>
      <styleUrl>#drcrop-${zone.recommendation}</styleUrl>
      <Polygon>
        <outerBoundaryIs><LinearRing>
          <coordinates>${polygonToKmlCoords(zone.polygon)}</coordinates>
        </LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>`;
}

function buildKml({ zones, boundary, blockName, capturedAt, summary }) {
  const styles = ["spray", "scout", "skip"].map(styleBlock).join("\n");
  const boundaryPlacemark = boundary
    ? `    <Placemark>
      <name>${xmlEscape((blockName || "Block") + " — boundary")}</name>
      <Style><LineStyle><color>ff333333</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>
      <Polygon><outerBoundaryIs><LinearRing>
        <coordinates>${polygonToKmlCoords(boundary)}</coordinates>
      </LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`
    : "";
  const placemarks = zones.map(placemarkForZone).join("\n");
  const summaryNote = summary
    ? `<description>${xmlEscape(
        `DrCrop drone-to-spray prescription for ${blockName || "Block"}.\n` +
        `Captured: ${capturedAt || "n/a"}.\n` +
        `Total: ${summary.totalAcres} ac. Spray: ${summary.sprayAcres} ac. Scout: ${summary.scoutAcres} ac. Skip: ${summary.skipAcres} ac.\n` +
        `Estimated savings: $${summary.estimatedSavingsUsd} (${summary.estimatedSavingsOunces} oz product, ${summary.sprayedAcresAvoidedPct}% sprayed-acres avoided).`
      )}</description>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlEscape(`DrCrop — ${blockName || "Block"} prescription`)}</name>
    ${summaryNote}
${styles}
${boundaryPlacemark}
${placemarks}
  </Document>
</kml>
`;
}

module.exports = { buildKml };
