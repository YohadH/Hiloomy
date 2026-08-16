// Meta Ads long-lived token refresh — runs as a side-effect of the
// data-refresh cron once a day.
//
// Long-lived Meta tokens last ~60 days. If we don't refresh before they
// lapse, the merchant has to manually reconnect — annoying for them,
// support load for us. Strategy: scan every MetaAdsConnection daily; for
// each token within REFRESH_WINDOW_DAYS of expiry, call Facebook's
// `fb_exchange_token` endpoint to mint a fresh 60-day token in place.
//
// Conservative refresh window (7 days) gives us multiple retry chances
// before the token actually expires.

import { getDb } from "@/lib/server/db";
import { refreshMetaAdsAccessToken } from "@/lib/services/meta-ads-service";

const REFRESH_WINDOW_DAYS = 7;

export interface MetaTokenRefreshResult {
  scanned: number;
  refreshed: number;
  skipped: number;
  failed: Array<{ storeId: string; error: string }>;
}

/**
 * Find every MetaAdsConnection whose token expires within the refresh
 * window and exchange it for a fresh long-lived token. Connections without
 * a known expiry are skipped (we can't tell if they need refreshing
 * without calling Graph API, which costs more than just waiting for the
 * next data sync to surface the issue).
 *
 * Safe to call repeatedly — the underlying refresh updates the row
 * atomically and per-store failures don't roll back other stores.
 */
export async function refreshMetaTokensNearExpiry(): Promise<MetaTokenRefreshResult> {
  const db = getDb();
  const result: MetaTokenRefreshResult = {
    scanned: 0,
    refreshed: 0,
    skipped: 0,
    failed: []
  };

  // Threshold: any token expiring before NOW + 7 days needs refreshing.
  // We also pick up tokens whose expiry has lapsed (overdue refresh).
  const threshold = new Date();
  threshold.setUTCDate(threshold.getUTCDate() + REFRESH_WINDOW_DAYS);

  const candidates = (await db.metaAdsConnection.findMany({
    where: {
      tokenExpiresAt: { lte: threshold }
    },
    select: { storeId: true, adAccountId: true, tokenExpiresAt: true }
  })) as Array<{ storeId: string; adAccountId: string; tokenExpiresAt: Date | null }>;

  result.scanned = candidates.length;

  for (const candidate of candidates) {
    try {
      await refreshMetaAdsAccessToken({ storeId: candidate.storeId });
      result.refreshed += 1;
    } catch (err) {
      result.failed.push({
        storeId: candidate.storeId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // Sanity: any connection without an expiry at all (legacy / not set) is
  // "skipped" so the operator can see the total in the cron log.
  const noExpiryCount = await db.metaAdsConnection.count({
    where: { tokenExpiresAt: null }
  });
  result.skipped = noExpiryCount;

  return result;
}
