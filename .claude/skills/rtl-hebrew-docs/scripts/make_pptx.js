#!/usr/bin/env node
/**
 * Generate a Hebrew (RTL) presentation with pptxgenjs.
 *
 * Key rule: set rtlMode at BOTH the deck level and every text block, 
 * pptxgenjs does not inherit it. Use a Hebrew-capable fontFace (Rubik /
 * Heebo / Arial); otherwise glyphs fall back to boxes.
 *
 * Usage:   node make_pptx.js [output.pptx]
 * Install: npm install pptxgenjs
 */

const pptxgen = require("pptxgenjs");

const OUT = process.argv[2] || "presentation.pptx";
const FONT = "Rubik";              // has Hebrew glyphs; NOT Roboto
const INK = "1A1A2E";
const ACCENT = "2D2D54";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_16x9";
pptx.rtlMode = true;               // deck-wide RTL

// --- Title slide ------------------------------------------------------------
const title = pptx.addSlide();
title.background = { color: "F3F3F8" };
title.addText("פתיחת הכנס השנתי", {
  x: 0.5, y: 2.0, w: "90%", h: 1.2,
  fontSize: 40, fontFace: FONT, bold: true, color: INK,
  align: "right", rtlMode: true,
});
title.addText("מגמות, מוצרים ושותפויות · 2026", {
  x: 0.5, y: 3.3, w: "90%", h: 0.8,
  fontSize: 20, fontFace: FONT, color: ACCENT,
  align: "right", rtlMode: true,
});

// --- Agenda slide -----------------------------------------------------------
const agenda = pptx.addSlide();
agenda.addText("על סדר היום", {
  x: 0.5, y: 0.4, w: "90%", h: 0.9,
  fontSize: 28, fontFace: FONT, bold: true, color: INK,
  align: "right", rtlMode: true,
});
agenda.addText(
  [
    { text: "מגמות בשוק לשנה הקרובה", options: { bullet: true, rtlMode: true } },
    { text: "הצגת המוצרים החדשים", options: { bullet: true, rtlMode: true } },
    { text: "סיפורי הצלחה מהשטח", options: { bullet: true, rtlMode: true } },
    { text: "מפגש עם השותפים האסטרטגיים", options: { bullet: true, rtlMode: true } },
  ],
  {
    x: 0.5, y: 1.6, w: "90%", h: 3.5,
    fontSize: 20, fontFace: FONT, color: INK,
    align: "right", rtlMode: true, lineSpacingMultiple: 1.5,
  }
);

// --- Data slide (numbers stay readable in an RTL deck) ----------------------
const data = pptx.addSlide();
data.addText("מספרים מהשנה שעברה", {
  x: 0.5, y: 0.4, w: "90%", h: 0.9,
  fontSize: 28, fontFace: FONT, bold: true, color: INK,
  align: "right", rtlMode: true,
});
const rows = [
  [
    { text: "מדד", options: { bold: true, fill: { color: "F3F3F8" }, align: "right", rtlMode: true } },
    { text: "תוצאה", options: { bold: true, fill: { color: "F3F3F8" }, align: "right", rtlMode: true } },
  ],
  [
    { text: "לקוחות חדשים", options: { align: "right", rtlMode: true } },
    { text: "1,240", options: { align: "right" } },
  ],
  [
    { text: "שביעות רצון", options: { align: "right", rtlMode: true } },
    { text: "96%", options: { align: "right" } },
  ],
];
data.addTable(rows, {
  x: 0.8, y: 1.7, w: 8.0, fontSize: 18, fontFace: FONT, color: INK,
  border: { type: "solid", color: "D0D0D8", pt: 1 },
});

pptx.writeFile({ fileName: OUT }).then(() => {
  console.log(`Generated: ${OUT}`);
  console.log("VERIFY: open it and confirm titles/bullets are right-aligned " +
    "RTL and Hebrew renders as letters (not boxes).");
});
