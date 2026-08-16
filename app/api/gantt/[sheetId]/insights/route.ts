// POST /api/gantt/[sheetId]/insights — ask the BI agent to read the
// parsed Gantt and produce insights: timeline risk, channel coverage,
// promotional clashes, gaps, prep-time concerns, etc.
//
// Result is cached on GanttSheet.insightsJson so re-opening the UI is
// instant. Force-regenerate with ?refresh=1.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import {
  askBiAgentJson,
  isBiAgentConfigured
} from "@/lib/clients/bi-agent-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface GanttInsightsPayload {
  summary: string;
  insights: Array<{
    title: string;
    severity: "info" | "warning" | "critical";
    body: string;
    // Optional: dates this insight relates to so the UI can highlight
    // them on the calendar.
    relatedDates?: string[];
    relatedCategories?: string[];
  }>;
  actions: Array<{
    title: string;
    body: string;
    suggestedDate?: string;
    suggestedActionType?: string;
  }>;
}

// Deterministic Hebrew insights derived purely from the sheet's rows.
// Used when the BI agent is unavailable, times out, or returns malformed
// JSON — so the planner never renders a raw error string. The checks
// mirror the highest-value patterns we ask the agent to look for (channel
// overload, coverage gaps, launches without creative prep) so the
// operator gets real signal even in the fallback path.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDeterministicInsights(sheet: any): GanttInsightsPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = sheet.rows ?? [];
  const rangeStart = sheet.rangeStart ? new Date(sheet.rangeStart) : null;
  const rangeEnd = sheet.rangeEnd ? new Date(sheet.rangeEnd) : null;

  const insights: GanttInsightsPayload["insights"] = [];
  const actions: GanttInsightsPayload["actions"] = [];

  // 1. Tasks per day — spot overloaded days (channel dump) and empty days.
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (!r.startDate) continue;
    const key = new Date(r.startDate).toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }
  const overloaded = [...byDate.entries()]
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (overloaded.length > 0) {
    insights.push({
      title: "ימים עם עומס משימות",
      severity: "warning",
      body: `${overloaded.length} ימים מרוכזים במיוחד (${overloaded.map(([d, c]) => `${d}: ${c} משימות`).join(", ")}). שקלו לפזר על פני שאר החודש.`,
      relatedDates: overloaded.map(([d]) => d)
    });
  }

  // 2. Launches without accompanying creative prep on/before the same day.
  const launches = rows.filter((r) => /השקה|LAUNCH|לאנץ|launch/i.test(r.task ?? ""));
  const creativeDates = new Set(
    rows
      .filter(
        (r) =>
          r.actionType === "creative_image" ||
          r.actionType === "creative_banner" ||
          r.actionType === "creative_video" ||
          /גרפיקה|בנר|קריאייטיב|creative|banner/i.test(r.task ?? "")
      )
      .filter((r) => r.startDate)
      .map((r) => new Date(r.startDate).toISOString().slice(0, 10))
  );
  const orphanLaunches = launches.filter((r) => {
    if (!r.startDate) return false;
    const launchKey = new Date(r.startDate).toISOString().slice(0, 10);
    return !creativeDates.has(launchKey);
  });
  if (orphanLaunches.length > 0) {
    insights.push({
      title: "השקות בלי הכנת קריאייטיב",
      severity: "critical",
      body: `${orphanLaunches.length} השקות מתוכננות בלי משימת קריאייטיב באותו יום — סימן שאין בנרים / גרפיקה מוכנים לפרסום.`,
      relatedDates: orphanLaunches
        .map((r) => (r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : null))
        .filter((d): d is string => d !== null)
    });
    actions.push({
      title: "קבעו יום הכנת קריאייטיב לכל השקה",
      body: "לכל השקה בגאנט הוסיפו משימה של גרפיקה או וידאו לפחות 2 ימים לפני, כדי שיהיה חומר לפרסום."
    });
  }

  // 3. Coupons/codes mentioned in tasks — quick roll-up so the operator can
  // cross-check what's actually created in Shopify.
  const couponRe = /(?:קוד(?:\s+קופון)?(?:\s+להטבה)?|קופון)\s*[:\-]\s*([A-Z0-9][A-Z0-9_\-]{1,32})/i;
  const coupons = new Set<string>();
  for (const r of rows) {
    const m = (r.task ?? "").match(couponRe);
    if (m && m[1]) coupons.add(m[1].toUpperCase());
  }
  if (coupons.size > 0) {
    insights.push({
      title: "קודי קופון שהוזכרו בגאנט",
      severity: "info",
      body: `זוהו ${coupons.size} קודים בטקסט: ${[...coupons].slice(0, 6).join(", ")}. ודאו שכולם קיימים בShopify Admin לפני הפרסום.`
    });
  }

  // 4. Coverage gap — # days in range that have zero activity.
  if (rangeStart && rangeEnd) {
    const totalDays = Math.max(
      1,
      Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );
    const emptyDays = totalDays - byDate.size;
    if (emptyDays >= Math.max(3, Math.floor(totalDays * 0.2))) {
      insights.push({
        title: "ימים ריקים בגאנט",
        severity: "info",
        body: `${emptyDays} מתוך ${totalDays} ימי החודש ללא אף משימה. אם זה מכוון — הכול תקין; אם לא — יש פערים בכיסוי.`
      });
    }
  }

  // 5. Duplicate coupon codes across different tasks — usually a copy-paste bug.
  const codeToTasks = new Map<string, number>();
  for (const r of rows) {
    const m = (r.task ?? "").match(couponRe);
    if (m && m[1]) {
      const k = m[1].toUpperCase();
      codeToTasks.set(k, (codeToTasks.get(k) ?? 0) + 1);
    }
  }
  const duplicates = [...codeToTasks.entries()].filter(([, n]) => n >= 3);
  if (duplicates.length > 0) {
    insights.push({
      title: "קוד קופון חוזר בהרבה משימות",
      severity: "warning",
      body: `${duplicates.map(([k, n]) => `"${k}" (${n} פעמים)`).join(", ")} — ייתכן שמדובר בכפילות שלא במקומה, או בקוד שיוצר בלבול בין מבצעים.`
    });
  }

  // Universal action — always useful.
  actions.push({
    title: "עברו על ימי העומס",
    body: "לימים העמוסים ביותר בגאנט (מסומנים באזהרה), בדקו אם אפשר להעביר חלק מהמשימות ליום סמוך."
  });

  const totalRows = rows.length;
  const summary = totalRows
    ? `הגאנט כולל ${totalRows} משימות ב${byDate.size} ימי פעילות. זוהו ${insights.length} תובנות מבוססות מבנה (סוכן הBI לא היה זמין — התובנות שלמעלה חושבו מקומית).`
    : "הגאנט ריק. העלו קובץ עם משימות כדי לקבל תובנות.";

  return { summary, insights: insights.slice(0, 6), actions: actions.slice(0, 6) };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sheetId: string }> }
) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    const db = getDb();
    const sheet = await db.ganttSheet.findFirst({
      where: { id: sheetId, storeId },
      include: { rows: { orderBy: [{ startDate: "asc" }, { rowIndex: "asc" }] } }
    });
    if (!sheet) throw new AppError("Sheet not found.", 404);

    // Return cached unless caller forced a refresh.
    if (!forceRefresh && sheet.insightsJson) {
      return NextResponse.json({
        ok: true,
        cached: true,
        generatedAt: sheet.insightsGeneratedAt?.toISOString() ?? null,
        insights: sheet.insightsJson
      });
    }

    // When the BI agent isn't configured we still return a usable set of
    // deterministic insights so the marketing planner panel isn't empty.
    // Same shape as the agent output — the UI can't tell the difference.
    if (!isBiAgentConfigured()) {
      const fallback = buildDeterministicInsights(sheet);
      return NextResponse.json({
        ok: true,
        cached: false,
        fallback: true,
        generatedAt: null,
        insights: fallback
      });
    }

    // Compact the row data into a digest the agent can reason about
    // without blowing context. We list each task by date + channel +
    // role + first 120 chars. Rows are capped at 80 for speed — the
    // BI tunnel gets choked when we send 300+ rows and the round-trip
    // starts overflowing Cloudflare's ~100s timeout.
    const ROW_PREVIEW_CHARS = 120;
    const MAX_ROWS_TO_AGENT = 80;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowsDigest = sheet.rows.slice(0, MAX_ROWS_TO_AGENT).map((r: any) => ({
      date: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
      category: r.category,
      role: r.role,
      action: r.actionType,
      task:
        r.task.length > ROW_PREVIEW_CHARS
          ? r.task.slice(0, ROW_PREVIEW_CHARS) + "…"
          : r.task
    }));
    const truncatedNote =
      sheet.rows.length > MAX_ROWS_TO_AGENT
        ? `\n(NOTE: only the first ${MAX_ROWS_TO_AGENT} of ${sheet.rows.length} rows shown to fit the token budget.)`
        : "";

    // Explicit date-range prelude at the very top of the prompt so the
    // agent can't drift on WHICH month it's analyzing. This is a common
    // failure — the agent sees "20/12/2025" in a task and starts writing
    // as if the whole plan is December, even when the calendar range is
    // clearly labeled otherwise.
    const rangeStartIso = sheet.rangeStart?.toISOString().slice(0, 10) ?? "unknown";
    const rangeEndIso = sheet.rangeEnd?.toISOString().slice(0, 10) ?? "unknown";
    const question = [
      `You are a senior marketing strategist reviewing a marketing calendar (Gantt) for an Israeli e-commerce brand.`,
      ``,
      `ANCHOR — DATE RANGE OF THIS CALENDAR (do not stray from these dates):`,
      `  Start: ${rangeStartIso}`,
      `  End:   ${rangeEndIso}`,
      `Every insight, action, and date reference MUST fall inside this range. If a task's date is outside this range, ignore it — it's a data anomaly.`,
      `${truncatedNote}`,
      ``,
      `The calendar covers ${rangeStartIso} → ${rangeEndIso}.`,
      `Channels (rows in the source sheet): ${(sheet.categoriesJson as string[]).join(", ") || "(none labeled)"}.`,
      `Owner roles: ${(sheet.rolesJson as string[]).join(", ") || "(none labeled)"}.`,
      `Team structure: web (website + landing pages), social (organic posts/stories/reels), graphic (banners, images, video), affiliates (influencers), email (newsletter + SMS), marketing (promos + discounts). Customer service is not an owner but must be briefed on every discount + launch.`,
      ``,
      `Calendar data (each task is one channel × one date cell):`,
      JSON.stringify(rowsDigest, null, 2),
      ``,
      `Output a JSON object with this shape:`,
      `{`,
      `  "summary": "2-3 sentence executive summary of the calendar.",`,
      `  "insights": [`,
      `    {`,
      `      "title": "Short headline (≤8 words).",`,
      `      "severity": "info" | "warning" | "critical",`,
      `      "body": "1-3 sentences. Specific, evidence-based.",`,
      `      "relatedDates": ["YYYY-MM-DD"],   // optional, dates this is about`,
      `      "relatedCategories": ["..."]      // optional, channels this is about`,
      `    }`,
      `  ],`,
      `  "actions": [`,
      `    {`,
      `      "title": "Imperative recommendation.",`,
      `      "body": "Why + what to do, 1-2 sentences.",`,
      `      "suggestedDate": "YYYY-MM-DD",                 // optional`,
      `      "suggestedActionType": "discount_code" | "creative_image" | "creative_banner" | "creative_video" | "social_post" | "email_campaign" | "sms_campaign" | "web_update" | "blog_post"  // optional`,
      `    }`,
      `  ]`,
      `}`,
      ``,
      `Focus on (use Hebrew labels in titles/body when the input is Hebrew — the calendar audience is Israeli):`,
      `  - Days with too much/too little going on (channel overload / gaps).`,
      `  - Promotional clashes (two competing offers same day).`,
      `  - Missing creative prep time (a launch with no banner work scheduled).`,
      `  - Coverage gaps (e.g. an Instagram story without a backing post).`,
      `  - Promo codes mentioned in task text that aren't created in Shopify yet.`,
      `  - Holiday alignment (Israeli market — pay attention to dates).`,
      `Return at most 6 insights and at most 6 actions. Pick the highest-leverage ones.`
    ].join("\n");

    let agentJson: GanttInsightsPayload | null = null;
    let agentError: string | null = null;
    try {
      agentJson = await askBiAgentJson<GanttInsightsPayload>({
        question,
        jsonHint: "object with summary:string, insights:array, actions:array",
        // 90s to match the BI-client default. The Cloudflare edge times out
        // around 100s so this is the ceiling before we lose the JSON path
        // and get an HTML error page in return.
        timeoutMs: 90_000
      });
    } catch (err) {
      agentError = err instanceof Error ? err.message : String(err);
      console.warn("[gantt-insights] BI agent failed, using deterministic fallback:", agentError);
    }

    // If the agent failed or returned junk, fall back to deterministic
    // insights so the marketing planner never surfaces a raw error. The
    // fallback is derived from the same sheet.rows the agent would have
    // seen — same structural quality checks, just no natural language
    // polish. Cache it so repeat visits don't re-hit a failing agent.
    if (!agentJson || typeof agentJson.summary !== "string") {
      agentJson = buildDeterministicInsights(sheet);
    }
    if (!Array.isArray(agentJson.insights)) agentJson.insights = [];
    if (!Array.isArray(agentJson.actions)) agentJson.actions = [];

    const updated = await db.ganttSheet.update({
      where: { id: sheet.id },
      data: {
        insightsJson: agentJson as object,
        insightsGeneratedAt: new Date()
      }
    });

    return NextResponse.json({
      ok: true,
      cached: false,
      generatedAt: updated.insightsGeneratedAt?.toISOString() ?? null,
      insights: agentJson
    });
  } catch (rawError) {
    const error = friendlyDbError(rawError);
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
