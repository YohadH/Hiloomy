// Unit tests for the Gantt brief's discount handling: coupon-code
// extraction (no marketing noise misread as codes), row dedupe, and the
// discount audit (duplicates, existing-code collisions, non-Plus
// feasibility callouts).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:9/hermetic-test";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditBriefDiscounts,
  dedupeRowsForBrief,
  extractCouponCode,
  type BriefOffer,
  type MarketingBrief
} from "@/lib/services/gantt-brief-generator-service";

// ─── extractCouponCode ────────────────────────────────────────────────

test("keyword-prefixed codes always win", () => {
  assert.equal(extractCouponCode("קוד קופון: LIHI"), "LIHI");
  assert.equal(extractCouponCode("קופון: NAME15 לא כולל כפל מבצעים"), "NAME15");
  assert.equal(extractCouponCode("קוד להטבה: WELCOME10"), "WELCOME10");
});

test("BXGY mechanics are not coupon codes (regression)", () => {
  assert.equal(extractCouponCode("בושם 702 BUY1 GET2"), null);
  assert.equal(extractCouponCode("מבצע BOGO על כל האתר"), null);
});

test("marketing acronyms and budget shorthand are not codes", () => {
  assert.equal(extractCouponCode("תקציב 20K כולל טיקטוק ROAS 2-3"), null);
  assert.equal(extractCouponCode("צילומי UGC לריל"), null);
  assert.equal(extractCouponCode("SALE באתר"), null);
});

test("a real inline code still extracts even after noise tokens", () => {
  assert.equal(extractCouponCode("BUY1 GET2 SET15"), "SET15");
  assert.equal(extractCouponCode("השקה עם LIHI20 בסטורי"), "LIHI20");
});

test("no code → null", () => {
  assert.equal(extractCouponCode("פוסט השקה לבושם החדש"), null);
  assert.equal(extractCouponCode(""), null);
});

// ─── dedupeRowsForBrief ───────────────────────────────────────────────

test("identical tasks across days merge into one row spanning the window", () => {
  const rows = dedupeRowsForBrief([
    { id: "a", task: "20% הנחה SET15", category: "קופון", role: "marketing", startDate: new Date("2026-07-05"), endDate: new Date("2026-07-05"), actionType: "discount_code" },
    { id: "b", task: "20% הנחה  SET15", category: "קופון", role: "marketing", startDate: new Date("2026-07-08"), endDate: new Date("2026-07-08"), actionType: "discount_code" },
    { id: "c", task: "פוסט השקה", category: "פוסט", role: "social", startDate: new Date("2026-07-05"), endDate: new Date("2026-07-05"), actionType: "social_post" }
  ]);
  assert.equal(rows.length, 2);
  const offer = rows.find((r) => r.task.includes("SET15"));
  assert.equal(offer?.startDate?.toISOString().slice(0, 10), "2026-07-05");
  assert.equal(offer?.endDate?.toISOString().slice(0, 10), "2026-07-08");
});

// ─── auditBriefDiscounts ──────────────────────────────────────────────

function offer(overrides: Partial<BriefOffer>): BriefOffer {
  return {
    headline: "הטבה",
    validityStart: "2026-07-01",
    validityEnd: "2026-07-31",
    conditions: [],
    ...overrides
  };
}

function brief(offers: BriefOffer[], influencerOffers: BriefOffer[] = []): MarketingBrief {
  return {
    header: { brandName: "Test", monthLabel: "יולי 2026" },
    permanentOffers: {
      shipping: { text: "" },
      memberSignup: { text: "" },
      abandonedCart: { text: "" }
    },
    influencerBlocks: influencerOffers.length ? [{ influencerName: "טסט", offers: influencerOffers }] : [],
    siteDiscounts: offers,
    paidPromotion: { campaigns: [] },
    ugcContent: [],
    generatedAt: new Date().toISOString(),
    rowCount: offers.length
  };
}

const calloutTexts = (o: BriefOffer) => (o.callouts ?? []).map((c) => c.text).join(" | ");

test("same coupon code on two offers → critical on both", () => {
  const a = offer({ headline: "20% הנחה", couponCode: "SARA15" });
  const b = offer({ headline: "מתנה ברכישה", couponCode: "sara15" });
  auditBriefDiscounts(brief([a, b]));
  assert.match(calloutTexts(a), /SARA15/);
  assert.equal(a.callouts?.[0].level, "critical");
  assert.match(calloutTexts(b), /SARA15/);
});

test("duplicate code across sections (site + influencer) is caught", () => {
  const site = offer({ headline: "הנחת אתר", couponCode: "LIHI" });
  const infl = offer({ headline: "קמפיין משפיענית", couponCode: "LIHI" });
  auditBriefDiscounts(brief([site], [infl]));
  assert.match(calloutTexts(site), /LIHI/);
  assert.match(calloutTexts(infl), /LIHI/);
});

test("code colliding with an existing affiliate code → critical", () => {
  const a = offer({ headline: "קמפיין חדש", couponCode: "DANA20" });
  auditBriefDiscounts(brief([a]), [{ code: "dana20", source: "קוד שותף" }]);
  assert.match(calloutTexts(a), /כבר קיים/);
  assert.match(calloutTexts(a), /קוד שותף/);
});

test("same headline twice → warning", () => {
  const a = offer({ headline: "20% הנחה על כל האתר" });
  const b = offer({ headline: "20% הנחה  על כל האתר" });
  auditBriefDiscounts(brief([a, b]));
  assert.match(calloutTexts(a), /כפילות/);
});

test("tiered discount → warning to split into separate codes", () => {
  const a = offer({ headline: "הנחה מדורגת", body: "10% מעל 200₪, 15% מעל 350₪" });
  auditBriefDiscounts(brief([a]));
  assert.match(calloutTexts(a), /מדורגת/);
  assert.equal(a.callouts?.some((c) => c.level === "warning"), true);
});

test("gift with purchase → info naming the Buy X Get Y mechanic (non-Plus)", () => {
  const a = offer({ headline: "מתנה בכל רכישה מעל 199₪" });
  auditBriefDiscounts(brief([a]));
  assert.match(calloutTexts(a), /Buy X Get Y/);
  assert.match(calloutTexts(a), /ללא צורך בPlus/);
});

test("unique one-time codes → info about needing an app for bulk", () => {
  const a = offer({ headline: "עגלה נטושה", body: "קוד חד ערכי בתוקף ל-48 שעות" });
  auditBriefDiscounts(brief([a]));
  assert.match(calloutTexts(a), /חד ערכיים/);
});

test("plain percentage offer with unique code → no callouts", () => {
  const a = offer({ headline: "15% הנחה", couponCode: "SUMMER15", body: "לא כולל כפל מבצעים" });
  auditBriefDiscounts(brief([a]));
  assert.equal((a.callouts ?? []).length, 0);
});

test("audit is idempotent — running twice doesn't duplicate callouts", () => {
  const a = offer({ headline: "20% הנחה", couponCode: "SARA15" });
  const b = offer({ headline: "מתנה", couponCode: "SARA15" });
  const briefObj = brief([a, b]);
  auditBriefDiscounts(briefObj);
  const after1 = (a.callouts ?? []).length;
  auditBriefDiscounts(briefObj);
  assert.equal((a.callouts ?? []).length, after1);
});
