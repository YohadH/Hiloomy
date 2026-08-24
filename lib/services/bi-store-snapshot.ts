// Hourly headline figures for one store, rendered as a short block of text
// and injected into the BI analyst's system prompt.
//
// Why: most questions a merchant asks first ("how are we doing?", "what's
// my margin?", "anything I should look at?") are answerable from a handful
// of numbers. Without this, every one of them costs a full tool round —
// a database rollup plus ~7,500 tokens of JSON payload — to surface figures
// that fit in ~250 tokens. With it, the model already knows them and either
// answers directly or reaches for a tool only when the question goes deeper.
//
// Deliberately prose, not JSON: the model reads this as context, and prose
// costs fewer tokens than the equivalent structure with braces and quotes.
//
// SECURITY: one row per store, read by storeId from the session. The text is
// built only from that store's own figures — never a comparison, ranking, or
// anything sourced from another tenant. The persona forbids benchmarking
// against other merchants and this must not become a back door to it.

import { getDb } from "@/lib/server/db";
import { buildContributionMargin } from "@/lib/services/contribution-margin-service";
import { listOpenAlerts } from "@/lib/services/alert-writer-service";

const SNAPSHOT_TTL_MINUTES = 60;

function money(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${currency} ${Math.round(value).toLocaleString("en-US")}`;
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  // Rates arrive as fractions in some services and percentages in others.
  const asPercent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${asPercent.toFixed(1)}%`;
}

async function buildSnapshotText(storeId: string, currency: string): Promise<string> {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);

  const [margin, alerts] = await Promise.all([
    buildContributionMargin({ storeId, start, end }).catch(() => null),
    listOpenAlerts({ storeId, limit: 5 }).catch(() => [])
  ]);

  const lines: string[] = [];

  if (margin && margin.totals.ordersIncluded === 0) {
    // An empty window is not a zero-revenue month. Without this the snapshot
    // asserts "revenue 0" and the model can confidently tell a merchant they
    // sold nothing, when the real answer is that no orders fall in the range
    // — a newly-connected store, a paused shop, or a sync that hasn't run.
    lines.push(
      "Last 30 days — no orders in this window. Do NOT report this as zero revenue; " +
        "say the window is empty and offer to look at a wider range or check the Shopify sync."
    );
  } else if (margin) {
    const t = margin.totals;
    lines.push(
      `Last 30 days — revenue ${money(t.revenue, currency)}, ` +
        `contribution margin ${money(t.contributionMargin, currency)} (${pct(t.contributionMarginRate)}), ` +
        `${t.ordersIncluded} orders.`
    );
    lines.push(
      `Discounts ${money(t.discounts, currency)}, refunds ${money(t.refunds, currency)}, ` +
        `COGS ${money(t.cogs, currency)}, affiliate commission ${money(t.affiliateCommission, currency)}, ` +
        `attributed ad spend ${money(t.attributedAdSpend, currency)}.`
    );
    // The persona is required to caveat weak data — give it the grounds to
    // do so up front instead of discovering them mid-answer.
    const q = margin.quality;
    lines.push(
      `Data quality: ${q.confidence} confidence, ${pct(q.costCoverage)} of revenue backed by real COGS` +
        (q.productsMissingCost > 0 ? `, ${q.productsMissingCost} products missing cost` : "") +
        "."
    );
  }

  if (Array.isArray(alerts) && alerts.length > 0) {
    const titles = alerts
      .map((a) => {
        const rec = a as unknown as Record<string, unknown>;
        return typeof rec.title === "string" ? rec.title : null;
      })
      .filter((t): t is string => Boolean(t))
      .slice(0, 5);
    if (titles.length) lines.push(`Open alerts (${titles.length}): ${titles.join("; ")}.`);
  }

  if (lines.length === 0) return "";

  return [
    "## Store snapshot (refreshed hourly)",
    "Headline figures for THIS store, already loaded — answer from these when they suffice, and call a tool only when the question needs detail they do not cover. If a figure reads n/a, the underlying data is missing; say so rather than guessing.",
    ...lines
  ].join("\n");
}

/**
 * Snapshot text for the prompt, regenerated at most once an hour per store.
 * Returns "" when figures can't be built — the caller simply omits the
 * section rather than injecting an empty heading.
 */
export async function getStoreSnapshotText(storeId: string, currency: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;

  try {
    const existing = await db.biStoreSnapshot.findUnique({
      where: { storeId },
      select: { summaryText: true, generatedAt: true }
    });
    if (existing) {
      const ageMinutes = (Date.now() - new Date(existing.generatedAt).getTime()) / 60_000;
      if (ageMinutes < SNAPSHOT_TTL_MINUTES) return existing.summaryText as string;
    }
  } catch (err) {
    console.error("[bi-snapshot] read failed:", err);
  }

  let text = "";
  try {
    text = await buildSnapshotText(storeId, currency);
  } catch (err) {
    console.error("[bi-snapshot] build failed:", err);
    return "";
  }

  try {
    await db.biStoreSnapshot.upsert({
      where: { storeId },
      create: { storeId, summaryText: text, generatedAt: new Date() },
      update: { summaryText: text, generatedAt: new Date() }
    });
  } catch (err) {
    console.error("[bi-snapshot] write failed:", err);
  }

  return text;
}
