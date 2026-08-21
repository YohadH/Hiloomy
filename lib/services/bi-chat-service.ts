// BI analyst chat — direct Anthropic API with store-scoped data tools.
//
// Replaces the Cloudflare-tunnel BI gateway for the customer-facing chat
// widget. The model answers with data it pulls through read-only tools
// over our own service layer; every tool closes over the storeId resolved
// from the AUTHENTICATED SESSION, so the model physically cannot query
// another tenant no matter what the user types. That is the multi-tenancy
// guarantee — keep it: never add a tool that takes a storeId (or org/shop
// identifier) from the model.
//
// The persona (system prompt) lives in lib/ai/bi-persona.ts — edit there.
//
// Loop shape: manual streaming loop over client.messages.stream() —
// text deltas are forwarded to the caller (SSE to the widget) while tool
// turns execute in between, so the user watches the answer form instead
// of staring at a spinner.
//
// Env: ANTHROPIC_API_KEY (Render dashboard). Absent → callers fall back
// to the legacy tunnel via isDirectBiConfigured().

import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/lib/server/db";
import { BI_PERSONA, buildRuntimeContext } from "@/lib/ai/bi-persona";
import { BI_TOOL_DEFINITIONS } from "@/lib/ai/bi-tool-definitions";
import { buildContributionMargin } from "@/lib/services/contribution-margin-service";
import { buildChannelPerformanceReport } from "@/lib/services/channel-performance-engine-service";
import { buildCohortRetention } from "@/lib/services/cohort-retention-service";
import { listOpenAlerts } from "@/lib/services/alert-writer-service";
import { buildCompetitorWeekSection } from "@/lib/services/competitor-intel-service";
import { buildKpiTrend, type TrendGranularity } from "@/lib/services/kpi-trend-service";
import { buildDiscountScorecards } from "@/lib/services/discount-scorecard-service";
import { buildMetaAdsWeeklyReport } from "@/lib/services/meta-ads-report-service";

const MODEL = process.env.BI_CHAT_MODEL || "claude-opus-5";
const MAX_TOKENS = 16000;
// Tool round-trips per question. 6 covers "compare two periods across two
// tools"; anything needing more is a sign the question should be narrowed.
const MAX_ITERATIONS = 6;
// Cap serialized tool results so one huge report can't blow the context.
const TOOL_RESULT_MAX_CHARS = 28_000;

export function isDirectBiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface BiChatHistoryEntry {
  role: "user" | "agent";
  text: string;
}

export interface RunBiChatTurnInput {
  storeId: string;
  locale: "he" | "en";
  question: string;
  // Prior thread messages (oldest first), so follow-ups have context.
  history?: BiChatHistoryEntry[];
  // App route the merchant is viewing (e.g. "/dashboard") — grounds the
  // persona's per-section reading rules.
  section?: string | null;
  // Called with each text delta as the model writes the visible answer.
  onTextDelta?: (delta: string) => void;
}

// ── Tools ───────────────────────────────────────────────────────────────
// Schemas live in lib/ai/bi-tool-definitions.ts (dependency-free, so the
// isolation tests can inspect them). Days windows are bounded so a typo
// can't trigger a multi-year scan.

function daysWindow(days: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return { start, end };
}

// Dispatch a tool call. `input` is the model-provided (already parsed)
// object; storeId always comes from the session, never from the model.
async function executeTool(
  storeId: string,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const int = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
    return Math.min(max, Math.max(min, n));
  };

  let result: unknown;
  switch (name) {
    case "get_profit_summary": {
      const { start, end } = daysWindow(int(input.days, 30, 1, 365));
      result = await buildContributionMargin({ storeId, start, end });
      break;
    }
    case "get_channel_performance": {
      const { start, end } = daysWindow(int(input.days, 30, 1, 365));
      result = await buildChannelPerformanceReport({ storeId, start, end });
      break;
    }
    case "get_kpi_trend": {
      const granularity: TrendGranularity =
        input.granularity === "day" || input.granularity === "month"
          ? input.granularity
          : "week";
      result = await buildKpiTrend({
        storeId,
        granularity,
        days: int(input.days, 90, 14, 730)
      });
      break;
    }
    case "get_ad_performance": {
      const { start, end } = daysWindow(int(input.days, 30, 1, 365));
      const [metaAds, margin] = await Promise.all([
        buildMetaAdsWeeklyReport({ storeId, start, end }),
        buildContributionMargin({ storeId, start, end }).catch(() => null)
      ]);
      result = {
        metaAds:
          metaAds ??
          "Meta Ads is not connected for this store — no ad-level data available.",
        // For margin-adjusted ROAS: multiply a row's ROAS by the blended
        // margin rate, and only when cost coverage supports it.
        marginContext: margin
          ? {
              blendedContributionMarginRate: margin.totals.contributionMarginRate,
              costCoverage: margin.quality.costCoverage,
              confidence: margin.quality.confidence
            }
          : null
      };
      break;
    }
    case "get_discount_effectiveness": {
      const { start, end } = daysWindow(int(input.days, 60, 1, 365));
      const [scorecards, metaAds] = await Promise.all([
        buildDiscountScorecards({ storeId, start, end }),
        buildMetaAdsWeeklyReport({ storeId, start, end }).catch(() => null)
      ]);
      // Daily ad spend across brands, for the confounding check: a
      // discount's lift that overlaps a spend spike is not the discount's.
      const adSpendByDate = new Map<string, number>();
      for (const brand of metaAds?.brands ?? []) {
        for (const day of brand.daily) {
          adSpendByDate.set(day.date, (adSpendByDate.get(day.date) ?? 0) + day.spend);
        }
      }
      result = {
        discounts: scorecards,
        adSpendDaily: adSpendByDate.size
          ? [...adSpendByDate.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, spend]) => ({ date, spend: Math.round(spend * 100) / 100 }))
          : null
      };
      break;
    }
    case "get_retention": {
      result = await buildCohortRetention({
        storeId,
        lookbackMonths: int(input.lookback_months, 12, 1, 24)
      });
      break;
    }
    case "get_open_alerts": {
      result = await listOpenAlerts({ storeId, limit: int(input.limit, 20, 1, 50) });
      break;
    }
    case "get_competitor_week": {
      const { start, end } = daysWindow(7);
      result = await buildCompetitorWeekSection({ storeId, start, end });
      if (result === null) {
        result = { note: "No competitor set is configured for this store yet." };
      }
      break;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  const serialized = JSON.stringify(result);
  return serialized.length > TOOL_RESULT_MAX_CHARS
    ? `${serialized.slice(0, TOOL_RESULT_MAX_CHARS)}…[truncated]`
    : serialized;
}

// ── Chat turn ───────────────────────────────────────────────────────────

export async function runBiChatTurn(input: RunBiChatTurnInput): Promise<string> {
  const client = new Anthropic();

  const db = getDb();
  const store = (await db.store.findUnique({
    where: { id: input.storeId },
    select: { name: true, currency: true }
  })) as { name: string; currency: string } | null;

  const system: Anthropic.TextBlockParam[] = [
    // Stable persona first, with a cache breakpoint — repeat questions pay
    // ~10% of the input cost for this block.
    { type: "text", text: BI_PERSONA, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: buildRuntimeContext({
        locale: input.locale,
        storeName: store?.name ?? null,
        currency: store?.currency ?? null,
        todayIso: new Date().toISOString().slice(0, 10),
        section: input.section ?? null
      })
    }
  ];

  const messages: Anthropic.MessageParam[] = [
    ...(input.history ?? []).slice(-12).map(
      (m): Anthropic.MessageParam => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text
      })
    ),
    { role: "user", content: input.question }
  ];

  let finalText = "";
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: BI_TOOL_DEFINITIONS,
      messages
    });

    if (input.onTextDelta) stream.on("text", input.onTextDelta);

    const message = await stream.finalMessage();
    for (const block of message.content) {
      if (block.type === "text") finalText += block.text;
    }

    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    if (message.stop_reason !== "tool_use") break;

    const toolUseBlocks = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    messages.push({ role: "assistant", content: message.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        try {
          const content = await executeTool(
            input.storeId,
            block.name,
            (block.input ?? {}) as Record<string, unknown>
          );
          return { type: "tool_result", tool_use_id: block.id, content };
        } catch (err) {
          console.error(`[bi-chat] tool ${block.name} failed:`, err);
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool failed: ${err instanceof Error ? err.message : "unknown error"}`,
            is_error: true
          };
        }
      })
    );
    messages.push({ role: "user", content: toolResults });
  }

  return finalText.trim();
}
