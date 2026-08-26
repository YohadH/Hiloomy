// POST /api/meta-ads/campaigns-insight — the BI insight under the Meta
// campaigns section on the Command Center. Recomputes the overview
// server-side (never trusts client aggregates), one-shot LLM, cached 6h
// per store+window in SystemConfig. {force:true} bypasses the cache
// (the section's refresh button).

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import {
  buildMetaCampaignsInsight,
  getMetaCampaignsOverview
} from "@/lib/services/meta-campaigns-overview-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const locale = auth.locale === "he" ? "he" : "en";
    const selection = await getReportingDateRangeSelection(locale);
    const overview = await getMetaCampaignsOverview(storeId, {
      start: selection.start,
      end: selection.end
    });
    if (!overview) {
      return NextResponse.json({ ok: false, error: "no_campaign_data" }, { status: 404 });
    }

    const insight = await buildMetaCampaignsInsight({
      storeId,
      overview,
      locale,
      force: body.force === true
    });
    if (!insight) {
      return NextResponse.json({ ok: false, error: "insight_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, insight });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
