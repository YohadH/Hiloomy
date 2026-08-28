// BI analyst chat — direct LLM API with store-scoped data tools.
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
// It is provider-agnostic: both loops below send the same text.
//
// ── Providers ──────────────────────────────────────────────────────────
// OpenAI is the default. Anthropic is kept because the loop already
// existed and gives us a second provider if OpenAI has an outage.
//
//   BI_CHAT_PROVIDER = "openai" | "anthropic"   (optional override)
//   OPENAI_API_KEY                              (default provider)
//   ANTHROPIC_API_KEY                           (used when provider=anthropic)
//   BI_CHAT_MODEL                               (optional model override)
//
// With neither key set the route returns 503 rather than falling back to
// the tunnel — the tunnel is no longer part of this path.
//
// Loop shape is the same for both: stream text deltas to the caller while
// tool turns execute in between, so the merchant watches the answer form
// instead of staring at a spinner. What differs is only the wire protocol
// — Anthropic returns tool_use content blocks and takes tool_result blocks
// back in a user message; OpenAI returns a tool_calls array and takes one
// role:"tool" message per call.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
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
import { getMetaCampaignsOverview } from "@/lib/services/meta-campaigns-overview-service";
import { readCachedToolResult, writeCachedToolResult } from "@/lib/services/bi-tool-cache";
import { getStoreSnapshotText } from "@/lib/services/bi-store-snapshot";

const MAX_TOKENS = 16000;
// Tool round-trips per question. 6 covers "compare two periods across two
// tools"; anything needing more is a sign the question should be narrowed.
const MAX_ITERATIONS = 6;
// Cap serialized tool results so one huge report can't blow the context.
// Lowered from 28k: at ~3.7 chars/token a single result was ~7,500 tokens,
// and six rounds could reach ~45,000. Answers cite the top rows, not whole
// reports — the model asks a narrower question when it needs more.
const TOOL_RESULT_MAX_CHARS = 10_000;

// Picked against what this account actually serves (GET /v1/models), not a
// generic default. The BI analyst orchestrates 10 tools over several rounds,
// reasons about margin, and writes Hebrew — Terra is the balanced tier and
// handles that; Sol is the frontier tier if answers need more depth, Luna is
// the cheap tier and too thin for multi-round tool work. Override per
// environment with BI_CHAT_MODEL.
const DEFAULT_OPENAI_MODEL = "gpt-5.6-terra";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

export type BiChatProvider = "openai" | "anthropic";

// Explicit override wins; otherwise whichever key is present, preferring
// OpenAI. Returns null when neither is configured so the route can 503
// instead of throwing halfway through a stream.
export function resolveBiProvider(): BiChatProvider | null {
  const explicit = process.env.BI_CHAT_PROVIDER?.trim().toLowerCase();
  if (explicit === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if (explicit === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function isDirectBiConfigured(): boolean {
  return resolveBiProvider() !== null;
}

function modelFor(provider: BiChatProvider): string {
  const override = process.env.BI_CHAT_MODEL?.trim();
  if (override) return override;
  return provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;
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
  // Called when the model decides to call a tool, before it runs. A turn can
  // spend a minute across several tool rounds with nothing on screen — this
  // is what lets the widget show what it is doing instead of a spinner.
  onToolStart?: (toolName: string) => void;
}

// ── Tools ───────────────────────────────────────────────────────────────
// Schemas live in lib/ai/bi-tool-definitions.ts (dependency-free, so the
// isolation tests can inspect them). Days windows are bounded so a typo
// can't trigger a multi-year scan.

// ── Customer PII gate ───────────────────────────────────────────────────
//
// Orders and customers carry names, emails and landing URLs. Those are the
// merchant's own records, but sending them to the model means sending them
// to OpenAI as a subprocessor — which touches your privacy policy and, on
// Shopify, the Protected Customer Data rules.
//
// So identity is OFF by default. The tools still return everything needed to
// analyse behaviour — order counts, lifetime value, returning status — keyed
// by the Shopify customer id, which the merchant can look up themselves. Set
// BI_EXPOSE_CUSTOMER_PII=1 to include names and emails, deliberately.
function customerPiiEnabled(): boolean {
  return process.env.BI_EXPOSE_CUSTOMER_PII === "1";
}

// A landing URL can carry an email or a name in its query string, so it is
// reduced to its path unless PII is enabled.
function safeLanding(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  if (customerPiiEnabled()) return raw.slice(0, 300);
  try {
    const u = new URL(raw, "https://placeholder.invalid");
    const utm = ["utm_source", "utm_medium", "utm_campaign"]
      .map((k) => (u.searchParams.get(k) ? `${k}=${u.searchParams.get(k)}` : null))
      .filter(Boolean)
      .join("&");
    return utm ? `${u.pathname}?${utm}` : u.pathname;
  } catch {
    return raw.split("?")[0].slice(0, 200);
  }
}

function shapeOrder(o: Record<string, unknown>): Record<string, unknown> {
  const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
  const customer = o.customer as Record<string, unknown> | null;
  const lineItems = o.lineItems as Array<Record<string, unknown>> | undefined;
  const counts = o._count as { lineItems?: number } | undefined;

  return {
    orderNumber: String(o.orderNumber ?? "—"),
    date: o.createdAt ? new Date(o.createdAt as Date).toISOString().slice(0, 10) : null,
    currency: o.currency ?? null,
    subtotal: num(o.subtotalPrice),
    discounts: num(o.totalDiscounts),
    tax: num(o.totalTax),
    shipping: num(o.totalShipping),
    refunds: num(o.totalRefunds),
    total: num(o.totalPrice),
    financialStatus: o.financialStatus ?? null,
    fulfillmentStatus: o.fulfillmentStatus ?? null,
    cancelled: Boolean(o.cancelledAt),
    channel: o.sourceName ?? null,
    referringSite: o.referringSite ?? null,
    landing: safeLanding(o.landingSiteRef),
    customerRef: customer?.shopifyCustomerId ? String(customer.shopifyCustomerId) : null,
    customerOrders: customer?.totalOrders ?? null,
    customerIsReturning: customer?.isReturning ?? null,
    ...(customerPiiEnabled() && customer
      ? { customerName: customer.name ?? null, customerEmail: customer.email ?? null }
      : {}),
    ...(lineItems
      ? {
          items: lineItems.map((li) => ({
            title: li.title,
            quantity: li.quantity,
            refundedQuantity: li.refundedQuantity,
            subtotal: num(li.lineSubtotal),
            discount: num(li.lineDiscountAmount)
          }))
        }
      : { itemCount: counts?.lineItems ?? null })
  };
}

function daysWindow(days: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return { start, end };
}

// Dispatch a tool call. `input` is the model-provided (already parsed)
// object; storeId always comes from the session, never from the model.
// Cache wrapper around the raw dispatch below. Every key is storeId-first —
// see lib/services/bi-tool-cache.ts for why that is non-negotiable.
async function executeTool(
  storeId: string,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const cached = await readCachedToolResult(storeId, name, input);
  if (cached !== null) return cached;
  const fresh = await executeToolUncached(storeId, name, input);
  await writeCachedToolResult(storeId, name, input, fresh);
  return fresh;
}

async function executeToolUncached(
  storeId: string,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  // Trim float noise before it reaches the model — 12449.830000000002 costs
  // tokens and invites the model to quote spurious precision.
  const round2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
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
      const [metaAds, margin, campaignOverview] = await Promise.all([
        buildMetaAdsWeeklyReport({ storeId, start, end }),
        buildContributionMargin({ storeId, start, end }).catch(() => null),
        // Per-campaign FUNNEL (impressions→link clicks→landing→ATC→checkout→
        // purchase). The weekly report only carries a brand-level funnel, so
        // without this the agent can't pinpoint which campaign leaks at which
        // stage — the exact analysis the dashboard insight now does.
        getMetaCampaignsOverview(storeId, { start, end }).catch(() => null)
      ]);
      const marginRate = margin?.totals?.contributionMarginRate ?? null;
      const breakevenRoas =
        marginRate && marginRate > 0 && (margin?.quality?.costCoverage ?? 0) >= 0.2
          ? Math.round((1 / marginRate) * 100) / 100
          : null;
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
          : null,
        // Breakeven ROAS = 1 / margin — judge good/bad against THIS, not 3x.
        breakevenRoas,
        campaignFunnel: campaignOverview
          ? campaignOverview.campaigns.map((c) => ({
              campaign: c.campaignName,
              spend: c.spend,
              roas: c.roas,
              activeRecently: c.activeRecently,
              funnel: {
                impressions: c.impressions,
                linkClicks: c.linkClicks,
                landingPageViews: c.landingPageViews,
                addToCart: c.addToCart,
                initiateCheckout: c.initiateCheckout,
                purchases: c.purchases
              }
            }))
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
    case "get_traffic": {
      const days = int(input.days, 30, 7, 90);
      const since = new Date(Date.now() - days * 86_400_000);
      const db = getDb() as any;
      const rows = (await db.gaTrafficDaily.findMany({
        where: { storeId, date: { gte: since } },
        orderBy: { date: "asc" },
        select: {
          date: true,
          channel: true,
          sessions: true,
          totalUsers: true,
          newUsers: true,
          conversions: true,
          revenue: true
        }
      })) as Array<{
        date: Date;
        channel: string;
        sessions: number;
        totalUsers: number;
        newUsers: number;
        conversions: unknown;
        revenue: unknown;
      }>;
      if (rows.length === 0) {
        result = { note: "GA4 is not connected for this store, or no traffic data has synced yet." };
        break;
      }
      const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const byChannel = new Map<string, { sessions: number; newUsers: number; conversions: number; revenue: number }>();
      const byDay = new Map<string, { sessions: number; conversions: number }>();
      let totalSessions = 0;
      let totalConversions = 0;
      for (const row of rows) {
        const c = byChannel.get(row.channel) ?? { sessions: 0, newUsers: 0, conversions: 0, revenue: 0 };
        c.sessions += row.sessions;
        c.newUsers += row.newUsers;
        c.conversions += n(row.conversions);
        c.revenue += n(row.revenue);
        byChannel.set(row.channel, c);
        const dayKey = row.date.toISOString().slice(0, 10);
        const d = byDay.get(dayKey) ?? { sessions: 0, conversions: 0 };
        d.sessions += row.sessions;
        d.conversions += n(row.conversions);
        byDay.set(dayKey, d);
        totalSessions += row.sessions;
        totalConversions += n(row.conversions);
      }
      result = {
        windowDays: days,
        totals: {
          sessions: totalSessions,
          conversions: Math.round(totalConversions * 100) / 100,
          sessionConversionRate:
            totalSessions > 0 ? Math.round((totalConversions / totalSessions) * 10000) / 10000 : null
        },
        channels: [...byChannel.entries()]
          .map(([channel, v]) => ({ channel, ...v, revenue: Math.round(v.revenue * 100) / 100 }))
          .sort((a, b) => b.sessions - a.sessions),
        daily: [...byDay.entries()].map(([date, v]) => ({ date, ...v }))
      };
      break;
    }
    case "get_organic_search": {
      const limit = int(input.limit, 15, 5, 50);
      const db = getDb() as any;
      const [queries, pages] = await Promise.all([
        db.searchConsoleQuery.findMany({
          where: { storeId },
          orderBy: { totalClicks: "desc" },
          take: limit,
          select: { query: true, totalImpressions: true, totalClicks: true, avgPosition: true }
        }),
        db.searchConsolePage.findMany({
          where: { storeId },
          orderBy: { totalClicks: "desc" },
          take: limit,
          select: { url: true, totalImpressions: true, totalClicks: true, avgPosition: true }
        })
      ]);
      if ((queries?.length ?? 0) === 0 && (pages?.length ?? 0) === 0) {
        result = {
          note: "Google Search Console is not connected for this store, or no search data has synced yet."
        };
        break;
      }
      result = {
        window: "rolling ~90 days (rollup)",
        topQueries: queries,
        topPages: pages
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
    case "get_orders": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = getDb() as any;
      const single = typeof input.order_number === "string" && input.order_number.trim().length > 0;
      const wantLines = typeof input.include_line_items === "boolean" ? input.include_line_items : single;

      const select = {
        orderNumber: true,
        createdAt: true,
        currency: true,
        subtotalPrice: true,
        totalDiscounts: true,
        totalTax: true,
        totalShipping: true,
        totalRefunds: true,
        totalPrice: true,
        financialStatus: true,
        fulfillmentStatus: true,
        cancelledAt: true,
        sourceName: true,
        referringSite: true,
        landingSiteRef: true,
        customer: { select: { shopifyCustomerId: true, totalOrders: true, isReturning: true, email: true, name: true } },
        ...(wantLines
          ? {
              lineItems: {
                select: { title: true, quantity: true, refundedQuantity: true, lineSubtotal: true, lineDiscountAmount: true },
                take: 40
              }
            }
          : { _count: { select: { lineItems: true } } })
      };

      let orders: Array<Record<string, unknown>>;
      if (single) {
        const num = (input.order_number as string).trim().replace(/^#/, "");
        // storeId scopes the lookup — an order number from another tenant
        // simply does not resolve.
        orders = await db.order.findMany({ where: { storeId, orderNumber: num }, select, take: 5 });
      } else {
        const { start, end } = daysWindow(int(input.days, 30, 1, 365));
        const where: Record<string, unknown> = { storeId, createdAt: { gte: start, lte: end } };
        const min = typeof input.min_total === "number" ? input.min_total : null;
        const max = typeof input.max_total === "number" ? input.max_total : null;
        if (min !== null || max !== null) {
          where.totalPrice = { ...(min !== null ? { gte: min } : {}), ...(max !== null ? { lte: max } : {}) };
        }
        if (input.refunded_only === true) where.totalRefunds = { gt: 0 };
        if (input.cancelled_only === true) where.cancelledAt = { not: null };
        if (typeof input.discount_code === "string" && input.discount_code.trim()) {
          where.discountUsages = { some: { code: { equals: input.discount_code.trim(), mode: "insensitive" } } };
        }
        const orderBy =
          input.sort_by === "oldest"
            ? { createdAt: "asc" as const }
            : input.sort_by === "highest_value"
              ? { totalPrice: "desc" as const }
              : input.sort_by === "lowest_value"
                ? { totalPrice: "asc" as const }
                : { createdAt: "desc" as const };
        orders = await db.order.findMany({ where, select, orderBy, take: int(input.limit, 20, 1, 50) });
      }

      result = {
        mode: single ? "single_order_lookup" : "order_list",
        piiIncluded: customerPiiEnabled(),
        note: customerPiiEnabled()
          ? "Customer names and emails are included because this store enabled PII for the assistant. Do not repeat them unless the merchant asked about that specific customer."
          : "Customer names and emails are withheld. customerRef is a stable Shopify customer id — use it to group orders by buyer, and tell the merchant to look the id up in Shopify if they need the person.",
        count: orders.length,
        orders: orders.map((o) => shapeOrder(o))
      };
      if (single && orders.length === 0) {
        result = { ...(result as object), note: `No order numbered "${String(input.order_number).trim()}" exists in this store.` };
      }
      break;
    }
    case "get_customers": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = getDb() as any;
      const where: Record<string, unknown> = { storeId };
      if (input.returning_only === true) where.isReturning = true;
      const minOrders = typeof input.min_orders === "number" ? int(input.min_orders, 1, 1, 100) : null;
      if (minOrders !== null) where.totalOrders = { gte: minOrders };

      const orderBy =
        input.sort_by === "order_count"
          ? { totalOrders: "desc" as const }
          : input.sort_by === "newest"
            ? { createdAt: "desc" as const }
            : input.sort_by === "recent_activity"
              ? { updatedAt: "desc" as const }
              : { lifetimeValue: "desc" as const };

      const [rows, totals, returningCount] = await Promise.all([
        db.customer.findMany({
          where,
          orderBy,
          take: int(input.limit, 15, 1, 50),
          select: {
            shopifyCustomerId: true,
            email: true,
            name: true,
            createdAt: true,
            firstOrderDate: true,
            totalOrders: true,
            lifetimeValue: true,
            isReturning: true
          }
        }),
        db.customer.aggregate({
          where: { storeId },
          _count: { _all: true },
          _avg: { lifetimeValue: true, totalOrders: true },
          _sum: { lifetimeValue: true }
        }),
        db.customer.count({ where: { storeId, isReturning: true } })
      ]);

      const total = (totals?._count?._all ?? 0) as number;
      result = {
        piiIncluded: customerPiiEnabled(),
        note: customerPiiEnabled()
          ? "Customer names and emails are included because this store enabled PII for the assistant."
          : "Names and emails are withheld. customerRef is a stable Shopify customer id the merchant can look up in Shopify.",
        storeTotals: {
          customers: total,
          returningCustomers: returningCount,
          returningRate: total > 0 ? Math.round((returningCount / total) * 1000) / 1000 : 0,
          averageLifetimeValue: Math.round(Number(totals?._avg?.lifetimeValue ?? 0) * 100) / 100,
          averageOrdersPerCustomer: Math.round(Number(totals?._avg?.totalOrders ?? 0) * 100) / 100,
          totalLifetimeValue: Math.round(Number(totals?._sum?.lifetimeValue ?? 0) * 100) / 100
        },
        customers: (rows as Array<Record<string, unknown>>).map((c) => ({
          customerRef: String(c.shopifyCustomerId ?? "—"),
          ...(customerPiiEnabled() ? { name: c.name ?? null, email: c.email ?? null } : {}),
          orders: Number(c.totalOrders ?? 0),
          lifetimeValue: Math.round(Number(c.lifetimeValue ?? 0) * 100) / 100,
          firstOrder: c.firstOrderDate ? new Date(c.firstOrderDate as Date).toISOString().slice(0, 10) : null,
          isReturning: Boolean(c.isReturning)
        }))
      };
      break;
    }
    case "get_product_performance": {
      const { start, end } = daysWindow(int(input.days, 30, 1, 365));
      const limit = int(input.limit, 10, 1, 25);
      // Whitelisted — never interpolate a model-supplied string into SQL.
      const ORDER_BY: Record<string, string> = {
        net_sales: "net_sales DESC",
        contribution_margin: "contribution_margin DESC",
        units: "units DESC",
        return_rate: "refunds DESC"
      };
      const sortKey = typeof input.sort_by === "string" ? input.sort_by : "net_sales";
      const orderBy = ORDER_BY[sortKey] ?? ORDER_BY.net_sales;

      // Same walk as contribution-margin-service: gross − discounts −
      // refunds = net sales; net sales − COGS = contribution margin.
      // Affiliate commission is order-level, not line-level, so it is
      // excluded here — flagged in the payload so the model doesn't present
      // this as the final margin when commissions are material.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = getDb() as any;
      const rows = (await db.$queryRawUnsafe(
        `SELECT
           COALESCE(li."productId", 'untracked:' || li.title) AS group_key,
           MIN(li.title)                                       AS title,
           SUM(li.quantity - li."refundedQuantity")::int        AS units,
           SUM(li."lineSubtotal")                               AS gross_sales,
           SUM(li."lineDiscountAmount")                         AS discounts,
           SUM(li."refundedSubtotal")                           AS refunds,
           SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal") AS net_sales,
           SUM(li."estimatedCostAmount")                        AS cogs,
           SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal" - li."estimatedCostAmount") AS contribution_margin,
           SUM(CASE WHEN li."estimatedCostAmount" > 0 THEN li."lineSubtotal" ELSE 0 END) AS revenue_with_cost
         FROM "OrderLineItem" li
         JOIN "Order" o ON o.id = li."orderId"
         WHERE li."storeId" = $1
           AND o."createdAt" >= $2
           AND o."createdAt" <= $3
         GROUP BY group_key
         HAVING SUM(li.quantity - li."refundedQuantity") <> 0
            OR SUM(li."lineSubtotal") <> 0
         ORDER BY ${orderBy}
         LIMIT $4`,
        storeId,
        start,
        end,
        limit
      )) as Array<Record<string, unknown>>;

      const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
      const totalNet = rows.reduce((sum, r) => sum + n(r.net_sales), 0);

      result = {
        window: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
        sortedBy: sortKey,
        note:
          "Line-item level. Contribution margin here excludes affiliate commission (order-level) " +
          "and excludes shipping and tax (pass-through). Products where costCoverage is 0 have no " +
          "cost inputs — their margin is not trustworthy, say so rather than quoting it.",
        products: rows.map((r) => {
          const gross = n(r.gross_sales);
          const netSales = n(r.net_sales);
          const refunds = n(r.refunds);
          return {
            title: String(r.title ?? "—"),
            units: n(r.units),
            grossSales: round2(gross),
            discounts: round2(n(r.discounts)),
            refunds: round2(refunds),
            netSales: round2(netSales),
            cogs: round2(n(r.cogs)),
            contributionMargin: round2(n(r.contribution_margin)),
            marginRate: netSales > 0 ? round2(n(r.contribution_margin) / netSales) : null,
            shareOfNetSales: totalNet > 0 ? round2(netSales / totalNet) : null,
            returnRate: gross > 0 ? round2(refunds / gross) : 0,
            costCoverage: gross > 0 ? round2(n(r.revenue_with_cost) / gross) : 0
          };
        })
      };
      if (rows.length === 0) {
        result = {
          ...(result as object),
          note: "No line items fall in this window. Do not report this as zero sales — say the window is empty and offer a wider one."
        };
      }
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
  const provider = resolveBiProvider();
  if (!provider) {
    throw new Error("No BI chat provider configured. Set OPENAI_API_KEY (or ANTHROPIC_API_KEY).");
  }

  const db = getDb();
  const store = (await db.store.findUnique({
    where: { id: input.storeId },
    select: { name: true, currency: true }
  })) as { name: string; currency: string } | null;

  const baseContext = buildRuntimeContext({
    locale: input.locale,
    storeName: store?.name ?? null,
    currency: store?.currency ?? null,
    todayIso: new Date().toISOString().slice(0, 10),
    section: input.section ?? null
  });

  // Headline figures for THIS store, so routine questions need no tool call.
  // Best-effort: a failure here costs a tool round, not an answer.
  const snapshot = await getStoreSnapshotText(input.storeId, store?.currency || "ILS").catch(() => "");
  const runtimeContext = snapshot ? `${baseContext}\n\n${snapshot}` : baseContext;

  return provider === "openai"
    ? runOpenAiTurn(input, runtimeContext)
    : runAnthropicTurn(input, runtimeContext);
}

// ── OpenAI loop (Responses API) ─────────────────────────────────────────
//
// Uses /v1/responses, NOT /v1/chat/completions. Verified against the live
// API: gpt-5.6 rejects function tools on chat/completions outright —
//   "Function tools with reasoning_effort are not supported for
//    gpt-5.6-terra in /v1/chat/completions. To use function tools, use
//    /v1/responses or set reasoning_effort to 'none'."
// Disabling reasoning would work but guts the thing that makes this a good
// analyst, so Responses it is. It carries tools and full reasoning together.
//
// Tool shape differs between the two OpenAI surfaces as well as from
// Anthropic: Anthropic nests the schema under `input_schema`, chat/completions
// nests it under `function`, and Responses takes it FLAT.
const OPENAI_TOOLS = BI_TOOL_DEFINITIONS.map((tool) => ({
  type: "function" as const,
  name: tool.name,
  description: tool.description,
  parameters: tool.input_schema as unknown as Record<string, unknown>,
  strict: false
}));

// The Responses streaming event union is wider than the handful of events we
// act on, so events are narrowed structurally as they arrive.
interface ResponseStreamEvent {
  type: string;
  delta?: string;
  item?: { type?: string; name?: string; arguments?: string; call_id?: string };
}

async function runOpenAiTurn(input: RunBiChatTurnInput, runtimeContext: string): Promise<string> {
  const client = new OpenAI();
  const model = modelFor("openai");

  // One system message rather than Anthropic's block array — OpenAI caches
  // long stable prefixes automatically, so there is no breakpoint to place.
  const conversation: unknown[] = [
    { role: "system", content: `${BI_PERSONA}\n\n${runtimeContext}` },
    ...(input.history ?? []).slice(-12).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text
    })),
    { role: "user", content: input.question }
  ];

  let finalText = "";

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    // Cast through unknown: the overload returns the non-streaming Response
    // type because the request object is widened by the `as never` above.
    const stream = (await client.responses.create({
      model,
      input: conversation,
      tools: OPENAI_TOOLS,
      max_output_tokens: MAX_TOKENS,
      stream: true
    } as never)) as unknown as AsyncIterable<ResponseStreamEvent>;

    let text = "";
    const calls: { name: string; args: string; callId: string }[] = [];

    for await (const event of stream) {
      if (event.type === "response.output_text.delta" && event.delta) {
        text += event.delta;
        input.onTextDelta?.(event.delta);
      }
      // Function calls arrive complete on output_item.done — the Responses
      // API assembles the streamed argument fragments for us, unlike
      // chat/completions where they must be concatenated by index.
      if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
        calls.push({
          name: event.item.name ?? "",
          args: event.item.arguments ?? "{}",
          callId: event.item.call_id ?? ""
        });
      }
    }

    finalText += text;
    if (calls.length === 0) break;

    // Every call must get an output back, failures included — the next
    // request is rejected if any call_id is left unanswered.
    for (const call of calls) input.onToolStart?.(call.name);

    const results = await Promise.all(
      calls.map(async (call) => {
        try {
          const args = call.args ? (JSON.parse(call.args) as Record<string, unknown>) : {};
          return { callId: call.callId, output: await executeTool(input.storeId, call.name, args) };
        } catch (err) {
          console.error(`[bi-chat] tool ${call.name} failed:`, err);
          return {
            callId: call.callId,
            output: `Tool failed: ${err instanceof Error ? err.message : "unknown error"}`
          };
        }
      })
    );

    for (const call of calls) {
      conversation.push({
        type: "function_call",
        call_id: call.callId,
        name: call.name,
        arguments: call.args
      });
    }
    for (const result of results) {
      conversation.push({
        type: "function_call_output",
        call_id: result.callId,
        output: result.output
      });
    }
  }

  return finalText.trim();
}

// ── Anthropic loop ──────────────────────────────────────────────────────

async function runAnthropicTurn(input: RunBiChatTurnInput, runtimeContext: string): Promise<string> {
  const client = new Anthropic();
  const MODEL = modelFor("anthropic");

  const system: Anthropic.TextBlockParam[] = [
    // Stable persona first, with a cache breakpoint — repeat questions pay
    // ~10% of the input cost for this block.
    { type: "text", text: BI_PERSONA, cache_control: { type: "ephemeral" } },
    { type: "text", text: runtimeContext }
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
        input.onToolStart?.(block.name);
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
