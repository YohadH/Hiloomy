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
  getMetaCampaignsOverview,
  packSignals,
  resolveBreakevenRoas
} from "@/lib/services/meta-campaigns-overview-service";
import { buildMetaCreativeSignals } from "@/lib/services/meta-creative-signals-service";

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

    // Deterministic layer first: it never fails on the model and is returned
    // with every response, so the card can show WATCH / TEST / REVIEW even
    // when phrasing is unavailable.
    const { breakevenRoas } = await resolveBreakevenRoas(storeId, overview);
    const signals = await buildMetaCreativeSignals({ storeId, overview, breakevenRoas }).catch(() => null);
    try {
      const insight = await buildMetaCampaignsInsight({ storeId, overview, locale, force: body.force === true, signals });
      if (!insight) {
        return NextResponse.json({ ok: false, error: "insight_unavailable", signals: packSignals(signals) }, { status: 503 });
      }
      return NextResponse.json({ ok: true, insight });
    } catch (error) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return NextResponse.json({ ok: false, error: toErrorMessage(error), signals: packSignals(signals) }, { status });
    }
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
