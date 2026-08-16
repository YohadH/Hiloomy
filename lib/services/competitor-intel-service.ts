// Competitor intelligence — the store's tracked comp set (max 5 active) and
// the weekly "what did competitors do this week" report section.
//
// Data flow: settings UI ⇄ CRUD here; the refresh-all cron calls
// syncCompetitorSignals() which pulls RivalSweeper Feed A (or the
// deterministic mock) and upserts one CompetitorSnapshot per competitor per
// day; the weekly report (print page + bundle) calls
// buildCompetitorWeekSection() which diffs this week against last week via
// the pure computeCompetitorChange() below (unit-tested).

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import {
  fetchCompetitorSignals,
  isRivalSweeperConfigured
} from "@/lib/clients/rivalsweeper-client";
import { upsertAlert, type AlertSeverity } from "@/lib/services/alert-writer-service";

export const MAX_ACTIVE_COMPETITORS = 5;

// ── DTOs ────────────────────────────────────────────────────────────────

export interface CompetitorRow {
  id: string;
  name: string;
  domain: string;
  igHandle: string | null;
  status: string;
  createdAt: string;
}

export interface CompetitorDayRow {
  snapshotDate: string; // YYYY-MM-DD
  activePromoCount: number;
  maxDiscountPct: number | null;
  freeShippingThreshold: number | null;
  homepageMessage: string | null;
}

export interface CompetitorWeekAggregate {
  hadPromo: boolean;
  // Max across the week's days — a promo that ran Tue-Thu still counts.
  maxDiscountPct: number | null;
  // Last observed day's state — "where they are now".
  latestPromoCount: number;
  latestDiscountPct: number | null;
  latestFreeShippingThreshold: number | null;
  latestMessage: string | null;
  // First day in the week a promo appeared after a promo-less day (or the
  // first observed day if the week opened with a promo). Null if no promo.
  promoStartDate: string | null;
}

export type CompetitorChangeKind =
  | "opened_promo"
  | "closed_promo"
  | "deepened_discount"
  | "reduced_discount"
  | "unchanged"
  | "no_data";

export interface CompetitorChange {
  kind: CompetitorChangeKind;
  summary: { he: string; en: string };
}

export interface CompetitorWeekEntry {
  competitorId: string;
  name: string;
  domain: string;
  current: {
    activePromoCount: number;
    maxDiscountPct: number | null;
    freeShippingThreshold: number | null;
    homepageMessage: string | null;
  };
  change: CompetitorChange;
}

export interface CompetitorWeekSection {
  periodStart: string;
  periodEnd: string;
  competitors: CompetitorWeekEntry[];
  totals: {
    tracked: number;
    openedPromo: number;
    deepenedDiscount: number;
    maxDiscountPct: number | null;
  };
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────

export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // strip protocol
  value = value.replace(/^www\./, "");
  value = value.split(/[/?#]/)[0]; // drop path/query/fragment
  return value.replace(/\.$/, "");
}

export function aggregateWeekDays(days: CompetitorDayRow[]): CompetitorWeekAggregate | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  let maxDiscountPct: number | null = null;
  let promoStartDate: string | null = null;
  let prevHadPromo = false;
  for (const day of sorted) {
    const dayHasPromo = day.activePromoCount > 0;
    if (day.maxDiscountPct !== null) {
      maxDiscountPct = maxDiscountPct === null ? day.maxDiscountPct : Math.max(maxDiscountPct, day.maxDiscountPct);
    }
    if (dayHasPromo && !prevHadPromo && promoStartDate === null) {
      promoStartDate = day.snapshotDate;
    }
    prevHadPromo = dayHasPromo;
  }
  const latest = sorted[sorted.length - 1];
  return {
    hadPromo: sorted.some((d) => d.activePromoCount > 0),
    maxDiscountPct,
    latestPromoCount: latest.activePromoCount,
    latestDiscountPct: latest.maxDiscountPct,
    latestFreeShippingThreshold: latest.freeShippingThreshold,
    latestMessage: latest.homepageMessage,
    promoStartDate
  };
}

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

export function computeCompetitorChange(
  current: CompetitorWeekAggregate | null,
  prior: CompetitorWeekAggregate | null
): CompetitorChange {
  if (!current) {
    return {
      kind: "no_data",
      summary: { he: "אין נתונים השבוע", en: "No data this week" }
    };
  }
  const curPct = current.maxDiscountPct;
  if (!prior) {
    // First tracked week — describe the current state without a diff claim.
    if (current.hadPromo && curPct !== null) {
      return {
        kind: "no_data",
        summary: {
          he: `במבצע של עד ${pct(curPct)} (שבוע ראשון במעקב)`,
          en: `Running up to ${pct(curPct)} off (first tracked week)`
        }
      };
    }
    return {
      kind: "no_data",
      summary: { he: "ללא מבצע (שבוע ראשון במעקב)", en: "No promo (first tracked week)" }
    };
  }
  if (!prior.hadPromo && current.hadPromo) {
    return {
      kind: "opened_promo",
      summary: {
        he: curPct !== null ? `פתח מבצע של עד ${pct(curPct)}` : "פתח מבצע חדש",
        en: curPct !== null ? `Opened a promo of up to ${pct(curPct)} off` : "Opened a new promo"
      }
    };
  }
  if (prior.hadPromo && !current.hadPromo) {
    return {
      kind: "closed_promo",
      summary: { he: "סגר את המבצע מהשבוע שעבר", en: "Closed last week's promo" }
    };
  }
  if (current.hadPromo && prior.hadPromo && curPct !== null && prior.maxDiscountPct !== null) {
    if (curPct > prior.maxDiscountPct) {
      return {
        kind: "deepened_discount",
        summary: {
          he: `העמיק הנחה מ-${pct(prior.maxDiscountPct)} ל-${pct(curPct)}`,
          en: `Deepened discount from ${pct(prior.maxDiscountPct)} to ${pct(curPct)}`
        }
      };
    }
    if (curPct < prior.maxDiscountPct) {
      return {
        kind: "reduced_discount",
        summary: {
          he: `הקטין הנחה מ-${pct(prior.maxDiscountPct)} ל-${pct(curPct)}`,
          en: `Reduced discount from ${pct(prior.maxDiscountPct)} to ${pct(curPct)}`
        }
      };
    }
  }
  return {
    kind: "unchanged",
    summary: {
      he: current.hadPromo && curPct !== null ? `ממשיך מבצע של ${pct(curPct)}` : "ללא שינוי",
      en: current.hadPromo && curPct !== null ? `Still running ${pct(curPct)} off` : "No change"
    }
  };
}

// ── CRUD ────────────────────────────────────────────────────────────────

function toRow(r: any): CompetitorRow {
  return {
    id: r.id,
    name: r.name,
    domain: r.domain,
    igHandle: r.igHandle ?? null,
    status: r.status,
    createdAt: r.createdAt.toISOString()
  };
}

export async function listCompetitors(storeId: string): Promise<CompetitorRow[]> {
  const db = getDb() as any;
  const rows = await db.competitor.findMany({
    where: { storeId },
    orderBy: { createdAt: "asc" }
  });
  return rows.map(toRow);
}

export async function addCompetitor(
  storeId: string,
  input: { name?: string; domain?: string; igHandle?: string | null }
): Promise<CompetitorRow> {
  const db = getDb() as any;
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  const domainRaw = typeof input.domain === "string" ? input.domain : "";
  const domain = normalizeDomain(domainRaw);
  if (!name) throw new AppError("Competitor name is required.", 400);
  if (!domain || !domain.includes(".")) {
    throw new AppError("A valid competitor domain is required (e.g. rival-brand.co.il).", 400);
  }
  const igHandle =
    typeof input.igHandle === "string" && input.igHandle.trim()
      ? input.igHandle.trim().replace(/^@/, "").slice(0, 80)
      : null;

  const existing = await db.competitor.findUnique({
    where: { storeId_domain: { storeId, domain } },
    select: { id: true }
  });
  if (!existing) {
    const activeCount = await db.competitor.count({ where: { storeId, status: "active" } });
    if (activeCount >= MAX_ACTIVE_COMPETITORS) {
      throw new AppError(
        `Up to ${MAX_ACTIVE_COMPETITORS} active competitors are supported. Archive one first.`,
        400
      );
    }
  }
  const row = await db.competitor.upsert({
    where: { storeId_domain: { storeId, domain } },
    update: { name, igHandle, status: "active" },
    create: { storeId, name, domain, igHandle }
  });
  return toRow(row);
}

export async function setCompetitorActive(
  storeId: string,
  competitorId: string,
  active: boolean
): Promise<void> {
  const db = getDb() as any;
  if (active) {
    const activeCount = await db.competitor.count({
      where: { storeId, status: "active", NOT: { id: competitorId } }
    });
    if (activeCount >= MAX_ACTIVE_COMPETITORS) {
      throw new AppError(
        `Up to ${MAX_ACTIVE_COMPETITORS} active competitors are supported. Archive one first.`,
        400
      );
    }
  }
  await db.competitor.updateMany({
    where: { id: competitorId, storeId },
    data: { status: active ? "active" : "archived" }
  });
}

export async function removeCompetitor(storeId: string, competitorId: string): Promise<void> {
  const db = getDb() as any;
  await db.competitor.deleteMany({ where: { id: competitorId, storeId } });
}

// ── Cron sync ───────────────────────────────────────────────────────────

export async function syncCompetitorSignals(
  storeId: string
): Promise<{ snapshotsUpserted: number; skippedNoData: number }> {
  const db = getDb() as any;
  const competitors = await db.competitor.findMany({
    where: { storeId, status: "active" },
    select: { id: true, domain: true, igHandle: true }
  });
  if (competitors.length === 0) return { snapshotsUpserted: 0, skippedNoData: 0 };

  const now = new Date();
  const snapshotDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const source =
    process.env.RIVALSWEEPER_MOCK === "true" || !isRivalSweeperConfigured()
      ? "mock"
      : "rivalsweeper";

  let snapshotsUpserted = 0;
  let skippedNoData = 0;
  for (const competitor of competitors) {
    const signals = await fetchCompetitorSignals({
      domain: competitor.domain,
      igHandle: competitor.igHandle,
      date: now
    });
    // Null = provider has no usable data for this domain yet (not monitored,
    // or monitored but never crawled). Skip — an upserted "0 promos" row
    // would poison the week-over-week diff with fake quiet.
    if (signals === null) {
      skippedNoData += 1;
      continue;
    }
    await db.competitorSnapshot.upsert({
      where: {
        storeId_competitorId_snapshotDate: {
          storeId,
          competitorId: competitor.id,
          snapshotDate
        }
      },
      update: {
        source,
        activePromoCount: signals.activePromoCount,
        maxDiscountPct: signals.maxDiscountPct,
        freeShippingThreshold: signals.freeShippingThreshold,
        homepageMessage: signals.homepageMessage,
        signalsJson: signals.raw ?? undefined
      },
      create: {
        storeId,
        competitorId: competitor.id,
        snapshotDate,
        source,
        activePromoCount: signals.activePromoCount,
        maxDiscountPct: signals.maxDiscountPct,
        freeShippingThreshold: signals.freeShippingThreshold,
        homepageMessage: signals.homepageMessage,
        signalsJson: signals.raw ?? undefined
      }
    });
    snapshotsUpserted += 1;
  }
  return { snapshotsUpserted, skippedNoData };
}

// ── Weekly report section ───────────────────────────────────────────────

function toDayRow(r: any): CompetitorDayRow {
  return {
    snapshotDate: r.snapshotDate.toISOString().slice(0, 10),
    activePromoCount: r.activePromoCount,
    maxDiscountPct: r.maxDiscountPct === null ? null : Number(r.maxDiscountPct),
    freeShippingThreshold:
      r.freeShippingThreshold === null ? null : Number(r.freeShippingThreshold),
    homepageMessage: r.homepageMessage ?? null
  };
}

export async function buildCompetitorWeekSection(input: {
  storeId: string;
  start: Date;
  end: Date;
}): Promise<CompetitorWeekSection | null> {
  const db = getDb() as any;
  const competitors = await db.competitor.findMany({
    where: { storeId: input.storeId, status: "active" },
    orderBy: { createdAt: "asc" }
  });
  if (competitors.length === 0) return null;

  const priorStart = new Date(input.start.getTime() - 7 * 86_400_000);
  const snapshots = await db.competitorSnapshot.findMany({
    where: {
      storeId: input.storeId,
      snapshotDate: { gte: priorStart, lte: input.end }
    },
    orderBy: { snapshotDate: "asc" }
  });

  const startKey = input.start.toISOString().slice(0, 10);
  const byCompetitor = new Map<string, { current: CompetitorDayRow[]; prior: CompetitorDayRow[] }>();
  for (const snap of snapshots) {
    const day = toDayRow(snap);
    let bucket = byCompetitor.get(snap.competitorId);
    if (!bucket) {
      bucket = { current: [], prior: [] };
      byCompetitor.set(snap.competitorId, bucket);
    }
    (day.snapshotDate >= startKey ? bucket.current : bucket.prior).push(day);
  }

  const entries: CompetitorWeekEntry[] = competitors.map((competitor: any) => {
    const bucket = byCompetitor.get(competitor.id) ?? { current: [], prior: [] };
    const current = aggregateWeekDays(bucket.current);
    const prior = aggregateWeekDays(bucket.prior);
    return {
      competitorId: competitor.id,
      name: competitor.name,
      domain: competitor.domain,
      current: {
        activePromoCount: current?.latestPromoCount ?? 0,
        maxDiscountPct: current?.maxDiscountPct ?? null,
        freeShippingThreshold: current?.latestFreeShippingThreshold ?? null,
        homepageMessage: current?.latestMessage ?? null
      },
      change: computeCompetitorChange(current, prior)
    };
  });

  const discounts = entries
    .map((e) => e.current.maxDiscountPct)
    .filter((v): v is number => v !== null);
  return {
    periodStart: startKey,
    periodEnd: input.end.toISOString().slice(0, 10),
    competitors: entries,
    totals: {
      tracked: entries.length,
      openedPromo: entries.filter((e) => e.change.kind === "opened_promo").length,
      deepenedDiscount: entries.filter((e) => e.change.kind === "deepened_discount").length,
      maxDiscountPct: discounts.length ? Math.max(...discounts) : null
    }
  };
}

// ── Alert engine — competitor moves that deserve a response ─────────────
//
// Turns the weekly competitor diff into approvable items in the Alert
// queue: a competitor that OPENED a promo or DEEPENED its discount this
// week becomes an open alert with a recommended response. Same closed-loop
// contract as stockout/roas — the founder resolves the alert ("I responded"
// / "ignored"), and alert-outcome-service measures what happened next.
//
// Fingerprint is per competitor per week-start, so the same competitor
// re-fires at most once per weekly window. Idempotent — safe to call from
// the refresh cron AND the Command Center's engine block.
export async function upsertCompetitorResponseAlerts(input: {
  storeId: string;
  start: Date;
  end: Date;
}): Promise<{ alertsUpserted: number }> {
  const section = await buildCompetitorWeekSection(input);
  if (!section) return { alertsUpserted: 0 };

  let upserted = 0;
  for (const entry of section.competitors) {
    const actionable =
      entry.change.kind === "opened_promo" || entry.change.kind === "deepened_discount";
    if (!actionable) continue;

    const discount = entry.current.maxDiscountPct;
    const severity: AlertSeverity = discount !== null && discount >= 25 ? "high" : "medium";
    const discountLabel = discount !== null ? `${Math.round(discount)}%` : null;

    await upsertAlert({
      storeId: input.storeId,
      type: "competitor_promo",
      fingerprint: `competitor_promo:${entry.competitorId}:${section.periodStart}`,
      severity,
      source: "Calculated",
      detectedBy: "competitor-intel-service",
      title:
        entry.change.kind === "opened_promo"
          ? `${entry.name} פתחו מבצע השבוע${discountLabel ? ` (עד ${discountLabel})` : ""}`
          : `${entry.name} העמיקו הנחה${discountLabel ? ` ל${discountLabel}` : ""}`,
      description:
        `${entry.change.summary.he}` +
        (entry.current.homepageMessage ? ` · מסר בדף הבית: "${entry.current.homepageMessage}"` : "") +
        (entry.current.freeShippingThreshold !== null
          ? ` · משלוח חינם מעל ₪${entry.current.freeShippingThreshold}`
          : ""),
      recommendedAction:
        severity === "high"
          ? "מבצע אגרסיבי אצל מתחרה. שקלו תגובה: הדגשת ערך מוצרי הדגל, הטבת משלוח, או קידום ממוקד לקהל שלהם — לא בהכרח הורדת מחיר."
          : "לעקוב אחרי ביצועי ההמרה השבוע. אם יש ירידה בהמרות — לשקול הצעת נגד ממוקדת.",
      metricName: "competitor_max_discount_pct",
      currentValue: discount ?? undefined,
      payloadJson: {
        competitorId: entry.competitorId,
        domain: entry.domain,
        changeKind: entry.change.kind,
        periodStart: section.periodStart,
        periodEnd: section.periodEnd
      },
      periodLabel: `${section.periodStart} → ${section.periodEnd}`
    });
    upserted++;
  }
  return { alertsUpserted: upserted };
}
