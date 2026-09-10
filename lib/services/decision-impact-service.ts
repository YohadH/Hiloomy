// Decision Impact — the scoreboard for Hiloomy's decision product.
//
// Measures Hiloomy itself, not the store: did it surface decisions, were
// they judged useful and not obvious, did they change what the manager
// planned to do, how fast were they answered, what happened afterwards, and
// is enough history accumulating to learn from. Every number comes from
// the existing ledger (Decision built from Alert rows) and shows its
// denominator. Nothing is estimated: no money saved, no ROI, no "faster
// than before" — there is no pre-Hiloomy baseline in the data.
//
// `computeDecisionImpact` is pure (unit-tested); `buildDecisionImpactReport`
// loads episodes and the memory learnings.

import type { Decision, DecisionStatus, HumanChoice, JudgmentTag, Localized } from "@/lib/domain/decision";
import { CANDIDATE_DOMAIN_LABEL, DOMAIN_OF_KIND, type CandidateDomain } from "@/lib/domain/decision-candidate";
import { listDecisionEpisodes, listDecisionMemory } from "@/lib/services/decision-inbox-service";

const DAY_MS = 86_400_000;

// A human answered (as opposed to pending / expired / auto-closed).
const HUMAN_CHOICES: HumanChoice[] = ["approved", "alternative", "ignored"];
export const isHumanChoice = (c: HumanChoice): boolean => HUMAN_CHOICES.includes(c);

// Sample sizes below which a rate is shown but flagged as not yet meaningful.
export const MIN_JUDGED_FOR_RATE = 10;
export const MIN_TIMING_SAMPLE = 5;
export const MIN_OUTCOMES_FOR_RATE = 5;

export type ImpactPeriodDays = 7 | 30 | 90 | null; // null = all time

// Plan decisions store the option key the manager chose; these keys mean
// "keep the plan" vs "change it" (see planDecision options in the inbox).
const PLAN_KEEP_KEYS = new Set(["activate", "keep"]);
const PLAN_CHANGE_KEYS = new Set(["shallower", "hold", "change", "stop"]);

export interface ImpactCounts {
  total: number; // judged
  useful: number;
  obvious: number;
  wrong: number;
  missingContext: number;
  highValue: number; // useful AND NOT obvious
  changedAnswered: number; // changedDecision is true or false
  changed: number; // true
  confirmed: number; // false
}

export interface ImpactTiming {
  sample: number;
  medianMs: number | null;
  fastestMs: number | null;
  slowestMs: number | null;
  pending: number;
  // surfaced → decided, only when both timestamps exist and are ordered
  buckets: { under1h: number; h1to4: number; h4to24: number; d1to3: number; over3d: number };
  // rows with decidedAt before surfacedAt — a ledger inconsistency, counted, not hidden
  anomalies: number;
}

export interface ImpactOutcomes {
  eligible: number; // surfaced + answered by a human
  measured: number; // eligible with an outcome
  win: number;
  neutral: number;
  miss: number;
  noData: number;
  winRate: number | null; // win / (win + neutral + miss)
}

export interface ImpactPlan {
  surfaced: number;
  acted: number; // answered by a human
  judged: number;
  useful: number;
  changed: number; // changed manager behaviour (judgment)
  changePlanStatus: number; // Hiloomy's verdict was CHANGE PLAN
  // From the chosen option key — only counted when the key is known.
  continuedAsPlanned: number;
  changedPlan: number;
  optionUnknown: number;
}

export interface ImpactDomainRow {
  key: CandidateDomain;
  label: Localized;
  surfaced: number;
  judged: number;
  useful: number;
  highValue: number;
  changed: number;
  wrong: number;
  obvious: number;
  measured: number;
  win: number;
}

export interface ImpactStory {
  id: string;
  kind: string;
  domain: CandidateDomain;
  crossDomain: boolean;
  question: Localized;
  whyNow: Localized;
  recommendation: Localized;
  status: DecisionStatus;
  choice: HumanChoice;
  judgment: JudgmentTag[];
  changedDecision: boolean | null;
  outcome: "win" | "neutral" | "miss" | "no_data" | null;
  outcomeSummary: Localized | null;
  surfacedAt: string | null;
  decidedAt: string | null;
  href: string; // canonical receipt
}

export interface ImpactMemory {
  recorded: number; // episodes detected in the period, surfaced or not
  withJudgment: number;
  withOutcome: number;
  comparableEpisodes: null; // no reliable definition exists yet — not measured
  learnings: Localized[]; // the existing Memory learnings (90-day, evidence-backed)
}

export interface DecisionImpactReport {
  period: { start: string | null; end: string; days: ImpactPeriodDays };
  domain: CandidateDomain | null;
  domainsAvailable: CandidateDomain[]; // domains that have at least one episode in the period
  surfaced: number;
  judgments: ImpactCounts;
  timing: ImpactTiming;
  outcomes: ImpactOutcomes;
  plan: ImpactPlan;
  domains: ImpactDomainRow[];
  stories: ImpactStory[];
  memory: ImpactMemory;
  // Ledger inconsistencies found while computing (shown, never hidden).
  notes: Localized[];
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function domainOf(kind: string): CandidateDomain {
  return DOMAIN_OF_KIND[kind] ?? "product_performance";
}

export interface ComputeOptions {
  now: Date;
  days: ImpactPeriodDays;
  domain: CandidateDomain | null;
  learnings?: Localized[];
}

export function computeDecisionImpact(all: Decision[], o: ComputeOptions): DecisionImpactReport {
  const end = o.now;
  const start = o.days === null ? null : new Date(end.getTime() - o.days * DAY_MS);
  const inPeriod = (iso: string | null | undefined) => {
    const t = ms(iso);
    return t !== null && (start === null || t >= start.getTime()) && t <= end.getTime();
  };
  const notes: Localized[] = [];

  // Episodes are unique ledger rows; guard against the same id twice anyway.
  const seen = new Set<string>();
  const episodes = all.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  if (episodes.length !== all.length) notes.push({ he: `${all.length - episodes.length} פרקים כפולים באותו מזהה סוננו.`, en: `${all.length - episodes.length} duplicate episodes with the same id were dropped.` });

  const domainsAvailable = [...new Set(episodes.filter((d) => inPeriod(d.ledger.surfacedAt) || inPeriod(d.detectedAt)).map((d) => domainOf(d.kind)))];
  const scoped = o.domain ? episodes.filter((d) => domainOf(d.kind) === o.domain) : episodes;

  // Surfaced in the period = shown as a card on Today (ledger.surfacedAt).
  const surfaced = scoped.filter((d) => inPeriod(d.ledger.surfacedAt));
  const judged = surfaced.filter((d) => d.judgment !== null);
  const has = (d: Decision, tag: JudgmentTag) => !!d.judgment?.tags.includes(tag);

  const judgments: ImpactCounts = {
    total: judged.length,
    useful: judged.filter((d) => has(d, "useful")).length,
    obvious: judged.filter((d) => has(d, "obvious")).length,
    wrong: judged.filter((d) => has(d, "wrong")).length,
    missingContext: judged.filter((d) => has(d, "missing_context")).length,
    highValue: judged.filter((d) => has(d, "useful") && !has(d, "obvious")).length,
    changedAnswered: judged.filter((d) => d.judgment!.changedDecision !== null).length,
    changed: judged.filter((d) => d.judgment!.changedDecision === true).length,
    confirmed: judged.filter((d) => d.judgment!.changedDecision === false).length
  };

  // Timing: surfaced → a real human answer.
  const durations: number[] = [];
  let anomalies = 0;
  for (const d of surfaced) {
    if (!isHumanChoice(d.human.choice)) continue;
    const a = ms(d.ledger.surfacedAt);
    const b = ms(d.human.decidedAt);
    if (a === null || b === null) continue;
    if (b < a) {
      anomalies += 1;
      continue;
    }
    durations.push(b - a);
  }
  if (anomalies) notes.push({ he: `${anomalies} החלטות נרשמו כמוכרעות לפני שהוצגו — סדר זמנים שגוי בפנקס; לא נכללו בזמן ההחלטה.`, en: `${anomalies} decisions were recorded as decided before they were surfaced — a ledger timestamp inconsistency; excluded from time to decision.` });
  const H = 3_600_000;
  const timing: ImpactTiming = {
    sample: durations.length,
    medianMs: median(durations),
    fastestMs: durations.length ? Math.min(...durations) : null,
    slowestMs: durations.length ? Math.max(...durations) : null,
    pending: surfaced.filter((d) => d.human.choice === "pending").length,
    buckets: {
      under1h: durations.filter((x) => x < H).length,
      h1to4: durations.filter((x) => x >= H && x < 4 * H).length,
      h4to24: durations.filter((x) => x >= 4 * H && x < 24 * H).length,
      d1to3: durations.filter((x) => x >= 24 * H && x < 72 * H).length,
      over3d: durations.filter((x) => x >= 72 * H).length
    },
    anomalies
  };

  // Outcomes: only decisions a human answered are eligible for measurement.
  const eligible = surfaced.filter((d) => isHumanChoice(d.human.choice));
  const measured = eligible.filter((d) => d.outcome !== null);
  const verdict = (v: "win" | "neutral" | "miss" | "no_data") => measured.filter((d) => d.outcome!.verdict === v).length;
  const win = verdict("win");
  const neutral = verdict("neutral");
  const miss = verdict("miss");
  const outcomes: ImpactOutcomes = {
    eligible: eligible.length,
    measured: measured.length,
    win,
    neutral,
    miss,
    noData: verdict("no_data"),
    winRate: win + neutral + miss > 0 ? Math.round((win / (win + neutral + miss)) * 100) : null
  };

  // Plan × Reality.
  const planRows = surfaced.filter((d) => d.kind === "plan_decision");
  const planActed = planRows.filter((d) => isHumanChoice(d.human.choice));
  const plan: ImpactPlan = {
    surfaced: planRows.length,
    acted: planActed.length,
    judged: planRows.filter((d) => d.judgment !== null).length,
    useful: planRows.filter((d) => has(d, "useful")).length,
    changed: planRows.filter((d) => d.judgment?.changedDecision === true).length,
    changePlanStatus: planRows.filter((d) => d.status === "change_plan").length,
    continuedAsPlanned: planActed.filter((d) => d.human.optionKey && PLAN_KEEP_KEYS.has(d.human.optionKey)).length,
    changedPlan: planActed.filter((d) => d.human.optionKey && PLAN_CHANGE_KEYS.has(d.human.optionKey)).length,
    optionUnknown: planActed.filter((d) => !d.human.optionKey || (!PLAN_KEEP_KEYS.has(d.human.optionKey) && !PLAN_CHANGE_KEYS.has(d.human.optionKey))).length
  };

  // Per domain — only domains with at least one surfaced decision.
  const domainKeys = [...new Set(surfaced.map((d) => domainOf(d.kind)))];
  const domains: ImpactDomainRow[] = domainKeys
    .map((key) => {
      const rows = surfaced.filter((d) => domainOf(d.kind) === key);
      const j = rows.filter((d) => d.judgment !== null);
      const m = rows.filter((d) => isHumanChoice(d.human.choice) && d.outcome !== null);
      return {
        key,
        label: CANDIDATE_DOMAIN_LABEL[key],
        surfaced: rows.length,
        judged: j.length,
        useful: j.filter((d) => has(d, "useful")).length,
        highValue: j.filter((d) => has(d, "useful") && !has(d, "obvious")).length,
        changed: j.filter((d) => d.judgment!.changedDecision === true).length,
        wrong: j.filter((d) => has(d, "wrong")).length,
        obvious: j.filter((d) => has(d, "obvious")).length,
        measured: m.length,
        win: m.filter((d) => d.outcome!.verdict === "win").length
      };
    })
    .sort((a, b) => b.surfaced - a.surfaced);

  // Stories: judged first, then with an outcome, high-value, cross-domain.
  const storyScore = (d: Decision) =>
    (d.judgment ? 2 : 0) + (d.outcome ? 2 : 0) + (has(d, "useful") && !has(d, "obvious") ? 3 : 0) + (d.domains.length >= 2 ? 1 : 0) + (d.judgment?.changedDecision === true ? 1 : 0) + (isHumanChoice(d.human.choice) ? 1 : 0);
  const stories: ImpactStory[] = [...surfaced]
    .sort((a, b) => storyScore(b) - storyScore(a) || (ms(b.ledger.surfacedAt) ?? 0) - (ms(a.ledger.surfacedAt) ?? 0))
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      domain: domainOf(d.kind),
      crossDomain: d.domains.length >= 2,
      question: d.question,
      whyNow: d.whyNow,
      recommendation: d.recommendation,
      status: d.status,
      choice: d.human.choice,
      judgment: d.judgment?.tags ?? [],
      changedDecision: d.judgment?.changedDecision ?? null,
      outcome: d.outcome?.verdict ?? null,
      outcomeSummary: d.outcome?.summary ?? null,
      surfacedAt: d.ledger.surfacedAt,
      decidedAt: d.human.decidedAt ?? null,
      href: `/today/${d.id}`
    }));

  // Memory readiness: every episode detected in the period, shown or not.
  const recorded = scoped.filter((d) => inPeriod(d.detectedAt) || inPeriod(d.ledger.surfacedAt));
  const memory: ImpactMemory = {
    recorded: recorded.length,
    withJudgment: recorded.filter((d) => d.judgment !== null).length,
    withOutcome: recorded.filter((d) => d.outcome !== null).length,
    comparableEpisodes: null,
    learnings: o.learnings ?? []
  };

  // Ledger consistency: a judgment without a human answer is possible
  // (the receipt allows judging a pending card); say so rather than hide it.
  const judgedButPending = judged.filter((d) => d.human.choice === "pending").length;
  if (judgedButPending) notes.push({ he: `${judgedButPending} החלטות נשפטו בלי הכרעה — השיפוט נספר, זמן ההחלטה לא.`, en: `${judgedButPending} decisions were judged without being answered — the judgment counts, the time to decision does not.` });

  return {
    period: { start: start ? start.toISOString() : null, end: end.toISOString(), days: o.days },
    domain: o.domain,
    domainsAvailable,
    surfaced: surfaced.length,
    judgments,
    timing,
    outcomes,
    plan,
    domains,
    stories,
    memory,
    notes
  };
}

export async function buildDecisionImpactReport(storeId: string, days: ImpactPeriodDays, domain: CandidateDomain | null): Promise<DecisionImpactReport> {
  const now = new Date();
  // Load a wider window than the period: a decision can surface after the
  // row was created (the ledger loader filters on createdAt).
  const since = days === null ? null : new Date(now.getTime() - (days + 60) * DAY_MS);
  const [episodes, memory] = await Promise.all([listDecisionEpisodes(storeId, since), listDecisionMemory(storeId).catch(() => ({ entries: [], learnings: [] as Localized[] }))]);
  return computeDecisionImpact(episodes, { now, days, domain, learnings: memory.learnings });
}

export function parseImpactDays(v: string | undefined): ImpactPeriodDays {
  if (v === "all") return null;
  const n = Number(v);
  return n === 7 || n === 90 ? n : 30;
}

export function formatDuration(msValue: number, locale: "he" | "en"): string {
  const m = Math.round(msValue / 60_000);
  if (m < 60) return locale === "he" ? `${m} דק׳` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 48) return locale === "he" ? `${h} שע׳ ${rem} דק׳` : `${h}h ${rem}m`;
  const d = Math.floor(h / 24);
  return locale === "he" ? `${d} ימים ${h % 24} שע׳` : `${d}d ${h % 24}h`;
}
