"use strict";

const zlib = require("zlib");

/**
 * Minimal, hand-rolled PDF 1.4 builder. Embeds one RGB image
 * (the zoned ortho) with FlateDecode and lays out a short report
 * using the Helvetica/Helvetica-Bold standard 14 fonts (no font
 * data shipped). Coordinate system is points (72/inch), origin
 * lower-left.
 *
 * Why hand-rolled: keeps the app dependency-free. A grower-facing
 * one-page PDF doesn't need pdfkit/jsPDF — about 200 lines of
 * format work.
 */

const PAGE_W = 612;   // US Letter portrait
const PAGE_H = 792;

function escapePdfString(value) {
  // PDF literal strings use \ to escape ( ) \. Non-ASCII chars are
  // out of scope for the demo report; replace with a question mark.
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .split("")
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 126 ? "?" : ch))
    .join("");
}

function tj(text) {
  return `(${escapePdfString(text)}) Tj`;
}

function buildPdf({ pixels, width, height, blockName, capturedAt, summary, zones }) {
  const imageData = zlib.deflateSync(pixels, { level: 6 });

  const objects = [];
  function pushObj(body) {
    objects.push(body);
    return objects.length;
  }

  const catalogId = 1;
  const pagesId = 2;
  const pageId = 3;
  const fontRegularId = 4;
  const fontBoldId = 5;
  const imageId = 6;
  const contentsId = 7;

  // Image XObject. RGB, 8 bits/channel, FlateDecoded raw scanlines.
  const imageDict = `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imageData.length} >>`;
  const imageObj = `${imageDict}\nstream\n`;

  // Layout.
  const margin = 54;        // 0.75"
  const imageDisplayW = PAGE_W - margin * 2;      // 504 pt
  const imageAspect = height / width;
  const imageDisplayH = imageDisplayW * imageAspect;
  const imageX = margin;
  const imageY = PAGE_H - margin - 90 - imageDisplayH; // leave 90pt headroom for header

  // Content stream: header, image, summary stats, top-zones table.
  const lines = [];
  lines.push("BT");
  lines.push(`/F2 18 Tf 1 0 0 1 ${margin} ${PAGE_H - margin} Tm`);
  lines.push(tj(`DrCrop — Drone-to-Spray Prescription`));
  lines.push("ET");
  lines.push("BT");
  lines.push(`/F1 11 Tf 1 0 0 1 ${margin} ${PAGE_H - margin - 18} Tm`);
  lines.push(tj(`Block: ${blockName || "Block"}     Captured: ${capturedAt || "n/a"}`));
  lines.push("ET");
  lines.push("BT");
  lines.push(`/F1 10 Tf 1 0 0 1 ${margin} ${PAGE_H - margin - 36} Tm`);
  lines.push(tj(`Red = spray, Yellow = scout, Green = skip. Pre-rendered onto the ortho below.`));
  lines.push("ET");

  // Image placement.
  lines.push("q");
  lines.push(`${imageDisplayW} 0 0 ${imageDisplayH} ${imageX} ${imageY} cm`);
  lines.push(`/Im1 Do`);
  lines.push("Q");

  // Summary block.
  const summaryY = imageY - 24;
  lines.push("BT");
  lines.push(`/F2 12 Tf 1 0 0 1 ${margin} ${summaryY} Tm`);
  lines.push(tj("Field summary"));
  lines.push("ET");

  const summaryRows = [
    `Total mapped acres: ${summary.totalAcres}`,
    `Spray (red): ${summary.sprayAcres} ac across ${summary.sprayCount} zones`,
    `Scout (yellow): ${summary.scoutAcres} ac across ${summary.scoutCount} zones`,
    `Skip (green): ${summary.skipAcres} ac across ${summary.skipCount} zones`,
    `Sprayed-acres avoided: ${summary.sprayedAcresAvoidedPct}%`,
    `Estimated savings: $${summary.estimatedSavingsUsd}  (${summary.estimatedSavingsOunces} oz product)`
  ];
  let cursorY = summaryY - 16;
  for (const row of summaryRows) {
    lines.push("BT");
    lines.push(`/F1 11 Tf 1 0 0 1 ${margin} ${cursorY} Tm`);
    lines.push(tj(row));
    lines.push("ET");
    cursorY -= 14;
  }

  // Footer.
  lines.push("BT");
  lines.push(`/F1 9 Tf 1 0 0 1 ${margin} ${margin / 2} Tm`);
  lines.push(tj("Decision-support only. Apply with a licensed applicator using already-registered products. Re-fly to verify."));
  lines.push("ET");

  const contentStream = lines.join("\n") + "\n";
  const contentDeflated = zlib.deflateSync(Buffer.from(contentStream, "latin1"), { level: 6 });
  const contentObj = `<< /Length ${contentDeflated.length} /Filter /FlateDecode >>\nstream\n`;

  // Assemble PDF bytes with manual xref.
  const parts = [];
  let offset = 0;
  function append(buf) {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "latin1");
    parts.push(b);
    offset += b.length;
  }

  append("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  const xrefOffsets = [];
  function writeObject(id, body, streamBuffer) {
    xrefOffsets[id] = offset;
    append(`${id} 0 obj\n`);
    append(body);
    if (streamBuffer) {
      append(streamBuffer);
      append("\nendstream\n");
    }
    append("endobj\n");
  }

  writeObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>\n`);
  writeObject(pagesId, `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>\n`);
  writeObject(
    pageId,
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << /Im1 ${imageId} 0 R >> >> ` +
      `/Contents ${contentsId} 0 R >>\n`
  );
  writeObject(fontRegularId, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n`);
  writeObject(fontBoldId, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\n`);
  writeObject(imageId, imageObj, imageData);
  writeObject(contentsId, contentObj, contentDeflated);

  const xrefStart = offset;
  const objectCount = objects.length; // we never populated it; rebuild from xrefOffsets length below
  const lastId = xrefOffsets.length - 1;
  append(`xref\n0 ${lastId + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= lastId; i += 1) {
    const o = xrefOffsets[i] || 0;
    append(`${o.toString().padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size ${lastId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  // Silence the unused-var lint signal for objectCount — we intentionally
  // track object IDs by index rather than push order.
  void objectCount;

  return Buffer.concat(parts);
}

module.exports = { buildPdf };
