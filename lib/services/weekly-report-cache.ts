// Cache layer for the weekly-report insights.
//
// The print page (/print/meta-ads-weekly) and the scheduled weekly-report
// email each regenerate three expensive artifacts:
//
//   • biCommentary   — BI agent, ~60s per render
//   • brandInsights  — OpenAI, per-brand, ~5-10s each
//   • igInsights     — OpenAI + BI agent, ~15s
//
// Combined, that turns a re-open of the same PDF from cached-instant into
// a 90-second Playwright render.
//
// ── LOCALE (2026-08-23) ────────────────────────────────────────────────
// These artifacts are LLM-generated prose, so they are language-specific.
// The cache used to key on (storeId, kind, periodEnd) only, which meant
// whichever language rendered first was served to everyone — a Hebrew
// merchant could open the report and read English commentary, and vice
// versa. `competitor-brief-service` already had this right (it versions
// its cache with `-${locale}`); this file was the inconsistency.
//
// Fix: the stored blob is now a MAP keyed by locale:
//
//   { "he": { biCommentary, brandInsights, igInsights }, "en": { … } }
//
// Locale lives inside `insightsJson` rather than in a new column so the
// WeeklyReport row still means "one report period" — adding a row per
// locale would double every entry in the user-facing report history.
//
// Legacy rows (flat shape, unknown language) are treated as a MISS so we
// never serve the wrong language once. They regenerate on first view and
// age out via the 24h TTL, so no migration is needed.
//
// Contract:
//   • Read: matches (storeId, kind, periodEnd within a 1-day window) and
//     then the locale bucket. Null if the freshest row is older than
//     `ttlHours` (default 24), has no bucket for this locale, or is legacy.
//   • Write: merges into the locale's bucket of an EXISTING row; never
//     creates one (rows are created by the scheduled cron only). Other
//     locales' buckets are preserved untouched.

import { getDb } from "@/lib/server/db";
import type { BrandInsights } from "@/lib/services/meta-ads-report-insights-service";
import type { InstagramInsights } from "@/lib/services/instagram-report-insights-service";
import type { BiWeeklyCommentary } from "@/lib/services/weekly-report-bi-commentary-service";

export type InsightsLocale = "he" | "en";

export interface CachedWeeklyInsights {
  biCommentary?: BiWeeklyCommentary | null;
  brandInsights?: Record<string, BrandInsights> | null;
  igInsights?: InstagramInsights | null;
  // ISO string so consumers can display "insights from N hours ago".
  cachedAt?: string;
}

/** Stored shape: one bucket per locale. */
type LocalizedInsightsBlob = Partial<Record<InsightsLocale, CachedWeeklyInsights>>;

const DEFAULT_TTL_HOURS = 24;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Pre-locale rows stored the artifacts at the top level. We can't know
// which language they're in, so they're deliberately unusable.
function isLegacyFlatBlob(blob: unknown): boolean {
  if (!blob || typeof blob !== "object") return false;
  const keys = Object.keys(blob as Record<string, unknown>);
  return keys.some((k) => k === "biCommentary" || k === "brandInsights" || k === "igInsights");
}

function periodWindow(periodEnd: Date) {
  return {
    gte: new Date(periodEnd.getTime() - ONE_DAY_MS),
    lte: new Date(periodEnd.getTime() + ONE_DAY_MS)
  };
}

// Read cached insights for the given window AND locale. Freshness is
// measured on the row's `generatedAt`, not `cachedAt` inside the JSON, so
// a freshly-persisted scheduled report counts as cached even before the
// print page has written biCommentary back into it.
export async function readCachedInsights(
  storeId: string,
  periodStart: Date,
  periodEnd: Date,
  locale: InsightsLocale = "he",
  kind: "weekly" | "monthly" = "weekly",
  ttlHours: number = DEFAULT_TTL_HOURS
): Promise<CachedWeeklyInsights | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const row = await db.weeklyReport.findFirst({
    where: { storeId, kind, periodEnd: periodWindow(periodEnd) },
    orderBy: { generatedAt: "desc" },
    select: { id: true, insightsJson: true, generatedAt: true }
  });
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.generatedAt).getTime();
  if (ageMs > ttlHours * 60 * 60 * 1000) return null;

  const blob = row.insightsJson as LocalizedInsightsBlob | null;
  if (!blob) return null;
  // Unknown-language legacy row: miss, so it regenerates in the right one.
  if (isLegacyFlatBlob(blob)) return null;

  const bucket = blob[locale];
  if (!bucket) return null;
  return { ...bucket, cachedAt: new Date(row.generatedAt).toISOString() };
}

// Write / merge insights into this locale's bucket on the most recent
// existing WeeklyReport row for the window. Never inserts a row — that's
// persistWeeklyReport's job during the scheduled cron. Buckets for other
// locales are preserved, so HE and EN coexist on the same report row.
//
// The merge runs INSIDE Postgres (one UPDATE, no read-modify-write in JS)
// because Prisma's `update` replaces the whole jsonb column. A read-then-
// write would let two renders in different languages finishing at the same
// time clobber each other: both read `{}`, then the later write lands
// without the earlier one's bucket and ~90s of generated prose is lost.
// `||` merges right-into-left, so we compose:
//
//   base  ||  { locale: (base->locale || patch) }
//
// which preserves sibling locales and merges field-by-field within the
// locale. Only non-null fields go into the patch, matching the `??`
// semantics this used to have: a failed generation leaves whatever was
// cached before rather than overwriting it with null.
export async function writeCachedInsights(
  storeId: string,
  periodStart: Date,
  periodEnd: Date,
  insights: CachedWeeklyInsights,
  locale: InsightsLocale = "he",
  kind: "weekly" | "monthly" = "weekly"
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (insights.biCommentary != null) patch.biCommentary = insights.biCommentary;
  if (insights.brandInsights != null) patch.brandInsights = insights.brandInsights;
  if (insights.igInsights != null) patch.igInsights = insights.igInsights;
  // Everything failed to generate — don't write an empty bucket, which
  // would read back as a HIT holding nothing and suppress the retry.
  if (Object.keys(patch).length === 0) return;

  const { gte, lte } = periodWindow(periodEnd);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;

  // The base must be read from w's OWN column inside the SET expression,
  // not lifted into a CTE. Under READ COMMITTED, a writer that blocks on a
  // concurrently-updated row re-evaluates column references against the
  // NEW row version (the same rule that makes `SET n = n + 1` safe) — but
  // a CTE is evaluated once against the original snapshot, so a CTE-held
  // base would reintroduce the very lost-update this is avoiding.
  //
  // `jsonb_exists_any` is the function form of the `?|` operator, used
  // because a literal `?` in a raw query collides with the driver's
  // placeholder parsing. It detects the pre-locale flat shape, which is
  // discarded (its language is unknowable) rather than merged.
  const BASE = `
    CASE
      WHEN w."insightsJson" IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(w."insightsJson") <> 'object' THEN '{}'::jsonb
      WHEN jsonb_exists_any(w."insightsJson", ARRAY['biCommentary', 'brandInsights', 'igInsights'])
        THEN '{}'::jsonb
      ELSE w."insightsJson"
    END`;

  // $executeRawUnsafe only so BASE can be composed in; every value is
  // still a bound parameter ($1…$6).
  await db.$executeRawUnsafe(
    `UPDATE "WeeklyReport" AS w
     SET "insightsJson" = (${BASE}) || jsonb_build_object(
       $5::text,
       COALESCE((${BASE}) -> $5::text, '{}'::jsonb) || $6::jsonb
     )
     WHERE w.id = (
       SELECT id FROM "WeeklyReport"
       WHERE "storeId" = $1
         AND "kind" = $2
         AND "periodEnd" >= $3
         AND "periodEnd" <= $4
       ORDER BY "generatedAt" DESC
       LIMIT 1
     )`,
    storeId,
    kind,
    gte,
    lte,
    locale,
    JSON.stringify(patch)
  );
}
