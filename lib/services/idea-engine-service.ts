// The Idea Engine — Hiloma's moves, ranked by MONEY, not novelty.
//
// Increment 1 (2 Sep 2026): recommend-only. It reuses the numbers that
// already exist and are trusted — the leak scan's per-leg ₪/month impact —
// and turns each into a ranked "idea" with a helper/maker tag, so the money-
// ranking is proven with real figures before any write-path (maker) exists.
// The net-new ideas (stockout interception, AOV bundles) and the makers
// (auto-merchandiser, repricing) are in the roadmap for later increments;
// nothing here executes anything.
//
// Rank = monthly ₪ impact ÷ effort. Effort is a small per-idea constant
// (a pause is cheap; restoring stock/traffic is more work), so the list
// answers "most money for least work, this week" rather than "biggest pile".

import { buildLeakScan, type LeakId } from "@/lib/services/leak-scan-service";

export type IdeaType = "helper" | "maker";

export interface Idea {
  id: LeakId;
  title: { he: string; en: string };
  /** Recommends-then-you-approve (helper) vs acts-within-guardrails (maker). */
  type: IdeaType;
  /** ₪ over the scan window. */
  windowAmount: number;
  /** Conservative ₪/month — the ranking numerator. */
  monthlyImpact: number;
  /** 1 (cheapest) … 5 (most work) — the ranking denominator. */
  effort: number;
  /** monthlyImpact / effort — higher ranks higher. */
  rankScore: number;
  why: { he: string; en: string };
  action: { he: string; en: string };
  detail?: { he: string; en: string };
  href: string;
}

export interface IdeaEngineReport {
  windowStart: string;
  windowEnd: string;
  windowDays: number;
  /** Σ monthly impact of the ranked ideas. */
  totalMonthlyImpact: number;
  ideas: Idea[];
}

// How each leak maps into an idea: the merchant-facing title, whether Hiloma
// could eventually act on it herself (maker) or only advise (helper), and the
// effort of the fix. All ship as HELPERS in increment 1 — the maker flag only
// records which ones become one-click actions once an executor is trusted.
const IDEA_META: Record<LeakId, { title: { he: string; en: string }; type: IdeaType; effort: number }> = {
  roas_burn: {
    title: { he: "עצירת בזבוז תקציב פרסום", en: "Cut ad-spend waste" },
    type: "maker", // pausing an ad set is reversible + the executor exists
    effort: 1
  },
  underwater_discounts: {
    title: { he: "קודי הנחה שמפסידים כסף", en: "Coupon counter-play" },
    type: "maker",
    effort: 2
  },
  silent_products: {
    title: { he: "הגנה על מוצרים מובילים שנדמו", en: "Best-seller defense" },
    type: "helper",
    effort: 3
  },
  affiliate_leakage: {
    title: { he: "עמלות על לקוחות שכבר שלכם", en: "Stop paying commission on owned customers" },
    type: "helper",
    effort: 2
  },
  silent_affiliates: {
    title: { he: "שותפות שלא מייצרות חשיפה", en: "Re-activate silent affiliates" },
    type: "helper",
    effort: 3
  }
};

export async function buildIdeaEngine(input: {
  storeId: string;
  start?: Date;
  end?: Date;
}): Promise<IdeaEngineReport> {
  const scan = await buildLeakScan(input);

  const ideas: Idea[] = scan.items
    // Only ideas with data AND a real ₪ opportunity — a healthy leg (amount 0)
    // is not an action worth ranking.
    .filter((leak) => leak.available && leak.monthlyImpact > 0)
    .map((leak) => {
      const meta = IDEA_META[leak.id];
      const monthlyImpact = Math.round(leak.monthlyImpact);
      return {
        id: leak.id,
        title: meta.title,
        type: meta.type,
        windowAmount: Math.round(leak.amount),
        monthlyImpact,
        effort: meta.effort,
        rankScore: Math.round(monthlyImpact / meta.effort),
        why: leak.reason,
        action: leak.action,
        detail: leak.detail,
        href: leak.href
      } satisfies Idea;
    })
    .sort((a, b) => b.rankScore - a.rankScore);

  return {
    windowStart: scan.windowStart,
    windowEnd: scan.windowEnd,
    windowDays: scan.windowDays,
    totalMonthlyImpact: ideas.reduce((sum, idea) => sum + idea.monthlyImpact, 0),
    ideas
  };
}
