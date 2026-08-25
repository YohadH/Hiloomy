import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { runIncrementalSync } from "@/lib/services/shopify-sync-service";
import { syncMetaAdsCampaignInsights } from "@/lib/services/meta-ads-service";
import { crawlPublicInstagramProfiles } from "@/lib/services/instagram-public-crawler-service";
import {
  syncCompetitorSignals,
  upsertCompetitorResponseAlerts
} from "@/lib/services/competitor-intel-service";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

type SourceResult = { ok: boolean; error?: string };

function describe(result: PromiseSettledResult<unknown>): SourceResult {
  return result.status === "fulfilled"
    ? { ok: true }
    : { ok: false, error: toErrorMessage(result.reason) };
}

/**
 * Triggered when the reporting date range is applied. Pulls the freshest data
 * from every external source so the dashboard reflects "now" for the new
 * window. Each source is best-effort: Meta / Instagram not being connected (or
 * a Shopify sync already running) must not fail the whole refresh.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const storeId = typeof body.storeId === "string" && body.storeId.trim() ? body.storeId.trim() : null;

  if (!storeId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await assertStoreInActiveOrg(storeId);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: err instanceof Error && "statusCode" in err ? (err as any).statusCode : 403 }
    );
  }

  // The picker writes the reporting-date-range cookie BEFORE calling this
  // route, so the cookie already holds the range the user just applied.
  // RivalSweeper's pull is scoped to it — "last 90 days" scans 90 days of
  // competitor records, and a past range lands its snapshot on the range's
  // end date so the period views find it.
  const range = await getReportingDateRangeSelection()
    .then((selection) => ({ start: selection.start, end: selection.end }))
    .catch(() => null);

  const [shopify, meta, instagram, competitors] = await Promise.allSettled([
    runIncrementalSync(storeId),
    syncMetaAdsCampaignInsights({ storeId }),
    crawlPublicInstagramProfiles({ storeId }),
    syncCompetitorSignals(storeId, { range }).then(async (res) => {
      // Fresh snapshots → refresh the competitor-response alert queue too.
      await upsertCompetitorResponseAlerts({
        storeId,
        start: new Date(Date.now() - 7 * 86_400_000),
        end: new Date()
      }).catch(() => null);
      return res;
    })
  ]);

  return NextResponse.json({
    ok: true,
    results: {
      shopify: describe(shopify),
      meta: describe(meta),
      instagram: describe(instagram),
      competitors: describe(competitors)
    }
  });
}
