// LLM usage ledger + daily budget.
//
// Nothing recorded what each model call cost, so a ₪-heavy afternoon could
// only be explained by reading code (7 Sep 2026). Every call now records
// tokens per store, per day, per feature in SystemConfig — no migration —
// and the expensive paths (chat, insights, briefs) check a per-store daily
// budget BEFORE calling the model. Cached answers never touch the budget.
//
// Env:
//   LLM_DAILY_BUDGET_USD        per-store daily cap, default 5
//   LLM_PRICE_INPUT_PER_M       USD per 1M input tokens  (estimate, default 2.5)
//   LLM_PRICE_OUTPUT_PER_M      USD per 1M output tokens (estimate, default 10)
// Prices are an ESTIMATE for the pinned model; the OpenAI dashboard is the
// bill. The point is relative control, not accounting.

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";

export type LlmFeature =
  | "chat"
  | "meta_insight"
  | "competitor_brief"
  | "next_move"
  | "weekly_commentary"
  | "gantt_brief"
  | "creative"
  | "other";

export interface LlmUsageDay {
  day: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  byFeature: Record<string, { calls: number; inputTokens: number; outputTokens: number; estimatedUsd: number }>;
}

const KEY = (storeId: string, day: string) => `llm_usage:${storeId}:${day}`;

function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function llmDailyBudgetUsd(): number {
  return envNumber("LLM_DAILY_BUDGET_USD", 5);
}

export function estimateUsd(inputTokens: number, outputTokens: number): number {
  const inPerM = envNumber("LLM_PRICE_INPUT_PER_M", 2.5);
  const outPerM = envNumber("LLM_PRICE_OUTPUT_PER_M", 10);
  return (inputTokens / 1_000_000) * inPerM + (outputTokens / 1_000_000) * outPerM;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getLlmUsageToday(storeId: string): Promise<LlmUsageDay> {
  const day = today();
  const db = getDb() as any;
  const row = await db.systemConfig.findUnique({ where: { key: KEY(storeId, day) }, select: { value: true } }).catch(() => null);
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value) as LlmUsageDay;
      if (parsed && typeof parsed.calls === "number") return parsed;
    } catch {
      // fall through to empty
    }
  }
  return { day, calls: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0, byFeature: {} };
}

export async function recordLlmUsage(input: {
  storeId: string;
  feature: LlmFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const usage = await getLlmUsageToday(input.storeId);
  const inTok = Math.max(0, Math.round(input.inputTokens));
  const outTok = Math.max(0, Math.round(input.outputTokens));
  const usd = estimateUsd(inTok, outTok);
  usage.calls += 1;
  usage.inputTokens += inTok;
  usage.outputTokens += outTok;
  usage.estimatedUsd = Math.round((usage.estimatedUsd + usd) * 10_000) / 10_000;
  const f = usage.byFeature[input.feature] ?? { calls: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };
  f.calls += 1;
  f.inputTokens += inTok;
  f.outputTokens += outTok;
  f.estimatedUsd = Math.round((f.estimatedUsd + usd) * 10_000) / 10_000;
  usage.byFeature[input.feature] = f;
  const db = getDb() as any;
  const key = KEY(input.storeId, usage.day);
  const value = JSON.stringify(usage);
  await db.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } }).catch(() => null);
  console.log(
    `[llm-usage] ${input.feature} · ${input.model} · in ${inTok} · out ${outTok} · ~$${usd.toFixed(4)} · store ${input.storeId} day total ~$${usage.estimatedUsd.toFixed(2)}`
  );
}

export const LLM_BUDGET_ERROR = "llm_budget_exhausted";

// Throws 429 when today's estimated spend for the store is at the budget.
export async function assertLlmBudget(storeId: string, feature: LlmFeature): Promise<void> {
  const budget = llmDailyBudgetUsd();
  if (budget <= 0) return; // 0 = unlimited (explicit opt-out)
  const usage = await getLlmUsageToday(storeId);
  if (usage.estimatedUsd >= budget) {
    console.warn(`[llm-usage] budget exhausted for ${storeId} (${feature}): ~$${usage.estimatedUsd.toFixed(2)} of $${budget}`);
    throw new AppError(LLM_BUDGET_ERROR, 429);
  }
}
