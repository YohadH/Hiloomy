// Collection rhythm (Insight Engine 4).
//
// "Which collection sells on which day — and when should I schedule its
// promo?"
//
// One SQL pass: order line items joined to collection memberships,
// grouped by collection × weekday IN THE STORE'S TIMEZONE (a Saturday-
// night IL order is a Sunday in UTC — using UTC would smear the Israeli
// weekend signal). Rolling window, default 12 weeks, so every weekday is
// sampled ~12 times.
//
// A "best day" is only declared with volume behind it (min orders) and a
// real lift (≥30% above the collection's average day) — otherwise the
// heatmap shows the distribution without pretending there's a signal.
//
// Consumers: the Profit page heatmap, the weekly report's scheduling
// line, and a day-based recommendation in the marketing planner.

import { getDb } from "@/lib/server/db";

export const WEEKDAY_LABELS: { he: string[]; en: string[] } = {
  // Postgres DOW: 0 = Sunday … 6 = Saturday (matches the Hebrew week).
  he: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
};

export interface RhythmCell {
  weekday: number; // 0=Sunday … 6=Saturday
  revenue: number; // net line revenue (after line discounts)
  orders: number;
  margin: number; // revenue − line COGS
}

export interface CollectionRhythmRow {
  collectionId: string;
  title: string;
  totalRevenue: number;
  totalOrders: number;
  cells: RhythmCell[]; // exactly 7, indexed by weekday
  bestDay: {
    weekday: number;
    revenue: number;
    /** revenue lift of the best day vs the average of the other days (0.3 = +30%). */
    lift: number;
  } | null;
}

export interface CollectionRhythmReport {
  windowStart: string;
  windowEnd: string;
  weeks: number;
  timeZone: string;
  rows: CollectionRhythmRow[];
  /** One concrete scheduling suggestion — the strongest significant signal. */
  recommendation: {
    collectionId: string;
    collectionTitle: string;
    weekday: number;
    lift: number;
    he: string;
    en: string;
  } | null;
}

const DEFAULT_WEEKS = 12;
const MAX_COLLECTIONS = 10;
const BEST_DAY_MIN_ORDERS = 20; // per collection over the whole window
const BEST_DAY_MIN_LIFT = 0.3;

// Catch-all collections ("All products", feed/DO-NOT-EDIT collections)
// mirror the whole store — their "rhythm" is just the store's rhythm and
// a scheduling recommendation for them is meaningless.
const CATCH_ALL_TITLE_RE = /all products|do not edit|כל המוצרים|כל הפריטים/i;

export async function buildCollectionRhythm(input: {
  storeId: string;
  weeks?: number;
  end?: Date;
}): Promise<CollectionRhythmReport> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const weeks = input.weeks ?? DEFAULT_WEEKS;
  const end = input.end ?? new Date();
  const start = new Date(end.getTime() - weeks * 7 * 86_400_000);

  const empty: CollectionRhythmReport = {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    weeks,
    timeZone: "UTC",
    rows: [],
    recommendation: null
  };
  if (!db?.shopifyCollection) return empty;

  const store = await db.store.findUnique({
    where: { id: input.storeId },
    select: { timezone: true }
  });
  const timeZone: string = store?.timezone || "UTC";

  // Weekday math in the store's local time. `createdAt` is stored as a
  // naive UTC timestamp, so anchor it to UTC first, then shift.
  const grouped: Array<{
    collection_id: string;
    weekday: number;
    revenue: number;
    cogs: number;
    orders: number;
  }> = await db.$queryRaw`
    SELECT pcm."collectionId" AS collection_id,
           EXTRACT(DOW FROM (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::int AS weekday,
           COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount"), 0)::float AS revenue,
           COALESCE(SUM(li."estimatedCostAmount"), 0)::float AS cogs,
           COUNT(DISTINCT o.id)::int AS orders
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    JOIN "ProductCollectionMembership" pcm
      ON pcm."productId" = li."productId" AND pcm."storeId" = li."storeId"
    WHERE li."storeId" = ${input.storeId}
      AND li."productId" IS NOT NULL
      AND o."createdAt" >= ${start}
      AND o."createdAt" <= ${end}
      AND o."cancelledAt" IS NULL
      AND o.test = false
    GROUP BY 1, 2
  `.catch(() => []);
  if (grouped.length === 0) return { ...empty, timeZone };

  interface Acc {
    cells: RhythmCell[];
    totalRevenue: number;
    totalOrders: number;
  }
  const byCollection = new Map<string, Acc>();
  for (const g of grouped) {
    const acc: Acc = byCollection.get(g.collection_id) ?? {
      cells: Array.from({ length: 7 }, (_, weekday) => ({ weekday, revenue: 0, orders: 0, margin: 0 })),
      totalRevenue: 0,
      totalOrders: 0
    };
    const day = Math.min(6, Math.max(0, g.weekday));
    acc.cells[day].revenue += g.revenue;
    acc.cells[day].orders += g.orders;
    acc.cells[day].margin += g.revenue - g.cogs;
    acc.totalRevenue += g.revenue;
    acc.totalOrders += g.orders;
    byCollection.set(g.collection_id, acc);
  }

  const collections: Array<{ id: string; title: string }> = await db.shopifyCollection.findMany({
    where: { id: { in: Array.from(byCollection.keys()) } },
    select: { id: true, title: true }
  });
  const titleOf = new Map(collections.map((c) => [c.id, c.title]));

  const rows: CollectionRhythmRow[] = [];
  for (const [collectionId, acc] of byCollection) {
    const title = titleOf.get(collectionId) ?? "—";
    if (CATCH_ALL_TITLE_RE.test(title)) continue;
    const best = [...acc.cells].sort((a, b) => b.revenue - a.revenue)[0];
    const othersAvg = (acc.totalRevenue - best.revenue) / 6;
    const lift = othersAvg > 0 ? best.revenue / othersAvg - 1 : 0;
    const significant =
      acc.totalOrders >= BEST_DAY_MIN_ORDERS && best.revenue > 0 && lift >= BEST_DAY_MIN_LIFT;
    rows.push({
      collectionId,
      title,
      totalRevenue: Math.round(acc.totalRevenue * 100) / 100,
      totalOrders: acc.totalOrders,
      cells: acc.cells.map((c) => ({
        ...c,
        revenue: Math.round(c.revenue * 100) / 100,
        margin: Math.round(c.margin * 100) / 100
      })),
      bestDay: significant
        ? { weekday: best.weekday, revenue: Math.round(best.revenue * 100) / 100, lift }
        : null
    });
  }

  rows.sort((a, b) => b.totalRevenue - a.totalRevenue);
  const kept = rows.slice(0, MAX_COLLECTIONS);

  // The scheduling recommendation: highest-revenue collection with a
  // significant day — revenue-weighting beats lift-chasing tiny signals.
  const pick = kept.find((r) => r.bestDay != null) ?? null;
  const recommendation = pick && pick.bestDay
    ? {
        collectionId: pick.collectionId,
        collectionTitle: pick.title,
        weekday: pick.bestDay.weekday,
        lift: pick.bestDay.lift,
        he: `שבצו את הקידום הבא של "${pick.title}" ליום ${WEEKDAY_LABELS.he[pick.bestDay.weekday]} — היום החזק שלה (${Math.round(pick.bestDay.lift * 100)}%+ מעל יום ממוצע ב־${weeks} השבועות האחרונים).`,
        en: `Schedule "${pick.title}"'s next push on ${WEEKDAY_LABELS.en[pick.bestDay.weekday]} — its strongest day (${Math.round(pick.bestDay.lift * 100)}%+ above an average day over the last ${weeks} weeks).`
      }
    : null;

  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    weeks,
    timeZone,
    rows: kept,
    recommendation
  };
}
