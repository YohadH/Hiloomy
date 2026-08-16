// POST /api/gantt/[sheetId]/brief[?refresh=1]
//
// Ask the brief generator to structure a full monthly marketing brief
// (matches the reference DOCX format the team already uses). Cached on
// GanttSheet.briefJson; force-regenerate with ?refresh=1.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import {
  auditBriefDiscounts,
  generateMarketingBrief,
  type ExistingDiscountCode,
  type MarketingBrief
} from "@/lib/services/gantt-brief-generator-service";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

function monthLabelFromRange(start: Date | null, end: Date | null): string {
  if (!start) return "";
  const monthsHe = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר"
  ];
  const startLabel = `${monthsHe[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  if (!end || end.getUTCMonth() === start.getUTCMonth()) return startLabel;
  return `${startLabel} → ${monthsHe[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
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
      include: {
        rows: { orderBy: [{ startDate: "asc" }, { rowIndex: "asc" }] },
        store: { select: { name: true } }
      }
    });
    if (!sheet) throw new AppError("Sheet not found.", 404);

    if (!forceRefresh && sheet.briefJson) {
      return NextResponse.json({
        ok: true,
        cached: true,
        generatedAt: sheet.briefGeneratedAt?.toISOString() ?? null,
        brief: sheet.briefJson
      });
    }

    const monthLabel = monthLabelFromRange(sheet.rangeStart, sheet.rangeEnd);
    // Wrap the generator in a try/catch even though it has its OWN
    // fallback inside — belt-and-braces so a bug in the fallback path
    // (or in the extract-* helpers) doesn't crash the whole route and
    // leave the operator staring at "HTTP 500". The endpoint's job is
    // to always return a usable brief; if everything fails, hand back
    // an empty-but-valid MarketingBrief so the UI can still render.
    let brief: MarketingBrief;
    try {
      brief = await generateMarketingBrief({
        storeBrandName: sheet.store?.name ?? "",
        monthLabel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows: sheet.rows.map((r: any) => ({
          id: r.id,
          task: r.task ?? "",
          category: r.category,
          role: r.role,
          startDate: r.startDate,
          endDate: r.endDate,
          actionType: r.actionType
        }))
      });
    } catch (err) {
      console.warn(
        "[gantt-brief] generateMarketingBrief threw, returning empty shell:",
        err instanceof Error ? err.message : String(err)
      );
      brief = {
        header: {
          brandName: sheet.store?.name ?? "",
          monthLabel,
          theme: null,
          campaignSummary: null,
          kpis: []
        },
        permanentOffers: {
          shipping: { text: "" },
          memberSignup: { text: "" },
          abandonedCart: { text: "" }
        },
        influencerBlocks: [],
        siteDiscounts: [],
        paidPromotion: { budgetSummary: null, roasTarget: null, campaigns: [] },
        ugcContent: [],
        generatedAt: new Date().toISOString(),
        rowCount: sheet.rows.length
      };
    }

    // Discount audit — flags duplicate coupon codes inside the brief,
    // collisions with existing affiliate codes/coupons, and offers whose
    // mechanics need special setup on a standard (non-Plus) Shopify plan.
    // Best-effort: an audit failure must never block the brief.
    try {
      const [members, affiliateCoupons] = await Promise.all([
        db.affiliateMember
          .findMany({ where: { storeId }, select: { affiliateCode: true, couponCode: true } })
          .catch(() => []),
        db.affiliateCoupon
          ? db.affiliateCoupon
              .findMany({ where: { storeId }, select: { code: true } })
              .catch(() => [])
          : []
      ]);
      const existingCodes: ExistingDiscountCode[] = [
        ...(members as Array<{ affiliateCode: string | null; couponCode: string | null }>).flatMap(
          (m) => [
            m.affiliateCode ? { code: m.affiliateCode, source: "קוד שותף" } : null,
            m.couponCode ? { code: m.couponCode, source: "קופון שותף" } : null
          ]
        ),
        ...(affiliateCoupons as Array<{ code: string | null }>).map((c) =>
          c.code ? { code: c.code, source: "קופון שותף קיים" } : null
        )
      ].filter((c): c is ExistingDiscountCode => Boolean(c));
      brief = auditBriefDiscounts(brief, existingCodes);
    } catch (err) {
      console.warn(
        "[gantt-brief] discount audit failed (brief returned unaudited):",
        err instanceof Error ? err.message : String(err)
      );
    }

    // Best-effort cache — if the write fails we still return the brief.
    let generatedAt: string | null = new Date().toISOString();
    try {
      const updated = await db.ganttSheet.update({
        where: { id: sheet.id },
        data: {
          briefJson: brief as unknown as object,
          briefGeneratedAt: new Date()
        }
      });
      generatedAt = updated.briefGeneratedAt?.toISOString() ?? generatedAt;
    } catch (err) {
      console.warn(
        "[gantt-brief] failed to cache brief on GanttSheet.briefJson:",
        err instanceof Error ? err.message : String(err)
      );
    }

    return NextResponse.json({
      ok: true,
      cached: false,
      generatedAt,
      brief
    });
  } catch (rawError) {
    // Log the raw error server-side BEFORE friendlyDbError rewrites it —
    // we lost context in prod once because friendlyDbError swallowed a
    // Prisma stack trace and produced an empty message, which the UI
    // then rendered as a bare "HTTP 500".
    console.error(
      "[gantt-brief] request failed:",
      rawError instanceof Error ? rawError.stack ?? rawError.message : String(rawError)
    );
    const error = friendlyDbError(rawError);
    const status = error instanceof AppError ? error.statusCode : 500;
    // Never send an empty error string — the client falls back to
    // "HTTP 500" when body.error is empty, which is what we've been
    // seeing on the marketing planner. Always produce SOMETHING actionable.
    const message =
      toErrorMessage(error) ||
      (rawError instanceof Error && rawError.message) ||
      "Brief generation failed with an unspecified error. Check server logs.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
