// Setup health score.
//
// For SaaS: when a new Shopify store owner connects, this engine produces
// the "what's working / what's missing" checklist that drives the
// onboarding flow and the persistent setup-health badge in the chrome.
//
// Score = % of checks that pass, weighted. Mandatory checks (Shopify
// connection, costs configured) carry more weight than nice-to-haves
// (Instagram, BixGrow).
//
// The point isn't to gate the app — every check failure is rendered with
// a "do this to improve accuracy" link. The point is to set EXPECTATIONS:
// if costs aren't configured, the contribution-margin number is going to
// be wrong, and the founder needs to know that BEFORE they trust the
// dashboard.

import { getDb } from "@/lib/server/db";

export type CheckStatus = "pass" | "fail" | "warning";

export interface SetupCheck {
  id: string;
  // Display category — drives the section the check renders in.
  category: "connections" | "data_quality" | "configuration";
  // Weight 1-3. Mandatory checks (Shopify, costs) are 3; major (Meta) is 2;
  // nice-to-haves (Instagram, BixGrow) are 1.
  weight: 1 | 2 | 3;
  status: CheckStatus;
  title: { he: string; en: string };
  description: { he: string; en: string };
  // Where to send the founder to fix it. Internal route preferred.
  fixHref?: string;
  fixLabel?: { he: string; en: string };
}

export interface SetupHealthReport {
  storeId: string;
  // 0..100. Sum of (weight × pass-coefficient) ÷ total possible weight.
  score: number;
  // "Report confidence" derived from the score — used as a single label
  // next to financial numbers ("Accuracy: 78% · click to improve").
  confidenceLevel: "high" | "medium" | "low";
  checks: SetupCheck[];
  // Summary counts so the badge can render without re-traversing.
  passed: number;
  failed: number;
  warnings: number;
  generatedAt: string;
}

export interface BuildSetupHealthInput {
  storeId: string;
}

export async function buildSetupHealth(
  input: BuildSetupHealthInput
): Promise<SetupHealthReport> {
  const db = getDb();
  const checks: SetupCheck[] = [];

  // ── Connections ────────────────────────────────────────────────────
  const shopify = await db.shopifyConnection.findFirst({
    where: { storeId: input.storeId },
    select: { id: true }
  });
  checks.push({
    id: "shopify_connected",
    category: "connections",
    weight: 3,
    status: shopify ? "pass" : "fail",
    title: { he: "Shopify מחובר", en: "Shopify connected" },
    description: shopify
      ? {
          he: "החנות מסונכרנת. הזמנות, מוצרים ולקוחות מגיעים אוטומטית.",
          en: "Store is syncing. Orders, products and customers flow in automatically."
        }
      : {
          he: "ללא חיבור Shopify אין על מה לבנות דוחות. זה הדבר הראשון.",
          en: "Without Shopify there is nothing to report on. This is the first connection."
        },
    fixHref: "/settings",
    fixLabel: { he: "לחבר Shopify", en: "Connect Shopify" }
  });

  const meta = await db.metaAdsConnection.findFirst({
    where: { storeId: input.storeId },
    select: { id: true }
  });
  checks.push({
    id: "meta_connected",
    category: "connections",
    weight: 2,
    status: meta ? "pass" : "fail",
    title: { he: "Meta Ads מחובר", en: "Meta Ads connected" },
    description: meta
      ? {
          he: "הוצאות וביצועי קמפיינים מגיעים אוטומטית.",
          en: "Campaign spend and performance flow in automatically."
        }
      : {
          he: "בלי Meta אין ROAS אמיתי וגילוי קריסות ROAS לא רץ.",
          en: "Without Meta there's no real ROAS and the collapse detector can't run."
        },
    fixHref: "/settings",
    fixLabel: { he: "לחבר Meta", en: "Connect Meta" }
  });

  const ig = await db.instagramConnection.findFirst({
    where: { storeId: input.storeId },
    select: { id: true }
  });
  checks.push({
    id: "instagram_connected",
    category: "connections",
    weight: 1,
    status: ig ? "pass" : "warning",
    title: { he: "Instagram מחובר", en: "Instagram connected" },
    description: ig
      ? {
          he: "מטריקות פוסטים ומשפיענים זמינות.",
          en: "Post engagement metrics and influencer roster are available."
        }
      : {
          he: "ללא Instagram חלק האורגני בדוחות חסר.",
          en: "Without Instagram the organic section of reports is empty."
        },
    fixHref: "/settings",
    fixLabel: { he: "לחבר Instagram", en: "Connect Instagram" }
  });

  const bix = await db.bixGrowConnection.findFirst({
    where: { storeId: input.storeId },
    select: { id: true }
  });
  // BixGrow can also be replaced by CSV uploads on the affiliate portal —
  // counts as pass either way.
  const hasAnyAffiliateData =
    bix != null ||
    (await db.affiliateAttribution.count({
      where: { storeId: input.storeId }
    })) > 0;
  checks.push({
    id: "affiliate_tracking",
    category: "connections",
    weight: 1,
    status: hasAnyAffiliateData ? "pass" : "warning",
    title: { he: "מעקב שותפים", en: "Affiliate tracking" },
    description: hasAnyAffiliateData
      ? {
          he: "נתוני שותפים זמינים (חיבור BixGrow או העלאת CSV).",
          en: "Affiliate data is flowing (via BixGrow or CSV upload)."
        }
      : {
          he: "אין נתוני שותפים. אם יש לך משפיענות אקטיביות, חברי BixGrow או העלי CSV.",
          en: "No affiliate data. If you have active affiliates, connect BixGrow or upload a CSV."
        },
    fixHref: "/affiliate-portal/conversions",
    fixLabel: { he: "להעלות CSV", en: "Upload CSV" }
  });

  // ── Configuration ─────────────────────────────────────────────────
  // Cost per product — drives every margin number. We measure coverage:
  // what fraction of products that have sold have a non-zero
  // estimatedCost configured.
  const recentSold = (await db.orderLineItem.groupBy({
    by: ["productId"],
    where: {
      storeId: input.storeId,
      productId: { not: null }
    },
    _count: { _all: true }
  })) as any[];
  const productIdsSold = recentSold.map((r: any) => r.productId as string);
  let productsWithCost = 0;
  if (productIdsSold.length > 0) {
    productsWithCost = await db.product.count({
      where: {
        id: { in: productIdsSold },
        OR: [
          { estimatedCost: { gt: 0 } },
          { costOverrideAmount: { gt: 0 } }
        ]
      }
    });
  }
  const costCoverage =
    productIdsSold.length > 0 ? productsWithCost / productIdsSold.length : 0;
  checks.push({
    id: "product_costs",
    category: "configuration",
    weight: 3,
    status: costCoverage >= 0.9 ? "pass" : costCoverage >= 0.5 ? "warning" : "fail",
    title: { he: "עלויות מוצרים מוגדרות", en: "Product costs configured" },
    description: {
      he: `${Math.round(costCoverage * 100)}% מהמוצרים שנמכרו (${productsWithCost}/${productIdsSold.length}) עם עלות מוגדרת. בלי עלויות מדויקות, רווח התרומה משוער בלבד.`,
      en: `${Math.round(costCoverage * 100)}% of sold products (${productsWithCost}/${productIdsSold.length}) have a cost configured. Without accurate costs, contribution margin is estimated only.`
    },
    fixHref: "/profit/costs",
    fixLabel: { he: "לעדכן עלויות", en: "Update costs" }
  });

  // UTM quality — coverage of orders with parseable UTM/referrer signal.
  // Drives channel performance accuracy.
  const recentOrdersAgg = await db.order.aggregate({
    where: {
      storeId: input.storeId,
      cancelledAt: null,
      test: false
    },
    _count: { _all: true }
  });
  const recentOrdersTotal = recentOrdersAgg._count._all;
  const ordersWithSignal = await db.order.count({
    where: {
      storeId: input.storeId,
      cancelledAt: null,
      test: false,
      OR: [
        { landingSiteRef: { not: null } },
        { referringSite: { not: null } }
      ]
    }
  });
  const utmCoverage = recentOrdersTotal > 0 ? ordersWithSignal / recentOrdersTotal : 0;
  checks.push({
    id: "utm_coverage",
    category: "data_quality",
    weight: 2,
    status: utmCoverage >= 0.7 ? "pass" : utmCoverage >= 0.4 ? "warning" : "fail",
    title: { he: "כיסוי UTM/Referrer", en: "UTM / referrer coverage" },
    description: {
      he: `${Math.round(utmCoverage * 100)}% מהזמנות נושאות שיוך זמין. ככל שהמספר גבוה יותר, ייחוס הערוצים מדויק יותר.`,
      en: `${Math.round(utmCoverage * 100)}% of orders carry usable attribution. Higher = more accurate channel attribution.`
    },
    fixHref: "/marketing-planner",
    fixLabel: { he: "לתכנן UTM למודעות", en: "Plan UTM on ads" }
  });

  // Recent sync run — did the Shopify cron actually run recently?
  const lastSync = await db.syncRun.findFirst({
    where: { storeId: input.storeId },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, status: true }
  });
  const syncFresh =
    !!lastSync &&
    Date.now() - new Date(lastSync.startedAt).getTime() < 6 * 60 * 60 * 1000;
  checks.push({
    id: "sync_recent",
    category: "data_quality",
    weight: 2,
    status: syncFresh ? "pass" : "warning",
    title: { he: "סנכרון Shopify טרי", en: "Shopify sync fresh" },
    description: lastSync
      ? {
          he: `סנכרון אחרון: ${new Date(lastSync.startedAt).toLocaleString("he-IL")} · סטטוס: ${lastSync.status}.`,
          en: `Last sync: ${new Date(lastSync.startedAt).toLocaleString("en-US")} · status: ${lastSync.status}.`
        }
      : {
          he: "לא בוצע סנכרון. הקרון אולי לא רץ.",
          en: "No sync run yet. The cron may not be configured."
        },
    fixHref: "/settings",
    fixLabel: { he: "להפעיל סנכרון ידני", en: "Trigger manual sync" }
  });

  // ── Score it up ────────────────────────────────────────────────────
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const earnedWeight = checks.reduce((sum, c) => {
    const coef = c.status === "pass" ? 1 : c.status === "warning" ? 0.5 : 0;
    return sum + c.weight * coef;
  }, 0);
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const confidenceLevel: "high" | "medium" | "low" =
    score >= 80 ? "high" : score >= 50 ? "medium" : "low";

  return {
    storeId: input.storeId,
    score,
    confidenceLevel,
    checks,
    passed: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "fail").length,
    warnings: checks.filter((c) => c.status === "warning").length,
    generatedAt: new Date().toISOString()
  };
}
