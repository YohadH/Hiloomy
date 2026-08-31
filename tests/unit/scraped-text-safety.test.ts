// Scraped competitor copy must be screened before it is quoted in the UI —
// and ordinary beauty/fragrance marketing must NOT be screened out, or the
// competitor panel goes silently blind.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isSafeScrapedText, safeScrapedText, safeScrapedTexts } from "../../lib/server/scraped-text-safety";

test("explicit adult copy is blocked in every supported language", () => {
  const blocked = [
    "Best XXX videos tonight",
    "Chicas calientes te esperan — sexo en vivo",
    "Vídeos porno gratis",
    "Rencontre sexe ce soir",
    "נערות ליווי בתל אביב",
    "Visit our OnlyFans for more",
    "Free PORN — no signup"
  ];
  for (const text of blocked) assert.equal(isSafeScrapedText(text), false, text);
});

test("normal fragrance / beauty marketing passes", () => {
  const allowed = [
    "Hot summer scents — 20% off this week",
    "Sexy, seductive, unforgettable: the new Noir collection",
    "Free shipping over ₪199",
    "Pasión en cada gota — nueva fragancia",
    "משלוח חינם מעל ₪199 — הבושם החדש הגיע",
    "Analyse de la peau offerte en boutique", // contains "anal" as a substring only
    "Cocktail hour: our top 5 scents"
  ];
  for (const text of allowed) assert.equal(isSafeScrapedText(text), true, text);
});

test("helpers drop unsafe strings and keep order", () => {
  assert.deepEqual(safeScrapedTexts(["Hot deals", "Free porn", "New arrivals"]), ["Hot deals", "New arrivals"]);
  assert.equal(safeScrapedText("Free porn"), null);
  assert.equal(safeScrapedText("New arrivals"), "New arrivals");
  assert.equal(safeScrapedText(null), null);
});
