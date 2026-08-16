import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { runIncrementalSync } from "@/lib/services/shopify-sync-service";
import { syncMetaAdsCampaignInsights } from "@/lib/services/meta-ads-service";
import { syncInstagramPostsForStore } from "@/lib/services/instagram-service";
import { refreshMetaTokensNearExpiry } from "@/lib/services/meta-token-refresh-service";
import { reconcileAffiliateAttributionOrphans } from "@/lib/services/affiliate-attribution-reconciler";
import { syncGscData, GSC_PLATFORM } from "@/lib/services/gsc-service";
import {
  syncCompetitorSignals,
  upsertCompetitorResponseAlerts
} from "@/lib/services/competitor-intel-service";

// Multi-source data refresh — the unified 2-hour cron tick.
//
// For every connected store, fans out four sync sources IN PARALLEL:
//   1. Shopify (orders/products/customers/refunds)
//   2. Meta Ads (campaign insights, ad creative metadata)
//   3. Instagram (creator posts, engagement)
//   4. BixGrow attribution placeholder (CSV path still preferred; this is
//      a no-op for stores without a BixGrow connection)
//
// Per-source failures are isolated — if Meta sync fails for store X,
// Shopify still completes for store X and all sources still run for
// store Y. The summary in the response indicates per-store / per-source
// outcomes so the cron's heartbeat log is actionable.
//
// Idempotency: every underlying sync is incremental and respects "last
// synced at" timestamps on each Connection row. Multiple invocations
// inside the same window are safe — the second call just sees nothing
// new to pull.
//
// Defense-in-depth against duplicate Render invocations (SA-MED-04): on top
// of the per-store SyncRun guard in shopify-sync-service (a real DB read that
// 409s an in-flight sync), this route also short-circuits a re-fired request
// carrying the SAME `Idempotency-Key` (or `X-Idempotency-Key`) header within a
// 5-minute window. Render can double-deliver a scheduled/cron invocation; the
// dedup below makes the second one a cheap 200 no-op instead of re-walking
// every store. The DB guard remains the source of truth — this is purely an
// early-exit optimization, so it lives in-process (a Map) and is best-effort
// (a process restart simply clears the cache, falling back to the DB guard).

export const dynamic = "force-dynamic";
// 10 min headroom for the slowest tick (large stores with thousands of
// new orders). The cron's own AbortController kills hung ticks earlier.
export const maxDuration = 600;

// In-process idempotency cache: idempotency-key -> epoch ms when first seen.
// Module-level so it survives across requests within a single server process.
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const recentIdempotencyKeys = new Map<string, number>();

// Drop expired entries so the Map can't grow unbounded over the process
// lifetime (one entry per distinct key per 5-min window — tiny, but tidy).
function pruneIdempotencyCache(now: number): void {
  for (const [key, seenAt] of recentIdempotencyKeys) {
    if (now - seenAt >= IDEMPOTENCY_WINDOW_MS) {
      recentIdempotencyKeys.delete(key);
    }
  }
}

// Returns true if this key was already seen inside the window (i.e. a duplicate
// invocation we should short-circuit). Otherwise records it and returns false.
// A request with no idempotency header is never treated as a duplicate.
function isDuplicateInvocation(request: Request): boolean {
  const key = (
    request.headers.get("idempotency-key") ??
    request.headers.get("x-idempotency-key") ??
    ""
  ).trim();
  if (!key) return false;

  const now = Date.now();
  pruneIdempotencyCache(now);

  const seenAt = recentIdempotencyKeys.get(key);
  if (seenAt !== undefined && now - seenAt < IDEMPOTENCY_WINDOW_MS) {
    return true;
  }

  recentIdempotencyKeys.set(key, now);
  return false;
}

interface PerStoreResult {
  storeId: string;
  storeName: string | null;
  shopify: { ok: boolean; skipped?: boolean; error?: string };
  metaAds: { ok: boolean; skipped?: boolean; error?: string };
  instagram: { ok: boolean; skipped?: boolean; error?: string };
  bixgrow: { ok: boolean; skipped: boolean };
  gsc: { ok: boolean; skipped?: boolean; pagesUpserted?: number; queriesUpserted?: number; error?: string };
  competitors: {
    ok: boolean;
    skipped?: boolean;
    snapshotsUpserted?: number;
    alertsUpserted?: number;
    error?: string;
  };
  affiliateReconcile?: { linked: number; deletedDuplicates: number; stillOrphan: number };
  affiliateSync?: { syncedOrders: number; error?: string };
}

async function handler(request: Request) {
  // Duplicate-invocation guard: if Render re-fires the same request (same
  // Idempotency-Key) within 5 minutes, return 200 immediately without doing
  // any sync work. The per-store DB SyncRun guard would 409 the overlapping
  // syncs anyway, but this avoids even walking the store list a second time.
  if (isDuplicateInvocation(request)) {
    return NextResponse.json({
      ok: true,
      deduplicated: true,
      message: "Duplicate invocation skipped (Idempotency-Key seen within 5m)."
    });
  }

  const db = getDb();

  // Pre-step: refresh any Meta long-lived tokens that are within 7 days of
  // expiry. Runs once at the top of each tick (not per-store) because the
  // refresh check is a single query. Failures here don't block the rest of
  // the cron — a store with an expired token will just fail its Meta sync
  // below, but Shopify + Instagram still sync.
  const tokenRefresh = await refreshMetaTokensNearExpiry().catch((err) => {
    console.error("[refresh-all] Meta token refresh failed:", err);
    return null;
  });
  if (tokenRefresh && tokenRefresh.refreshed > 0) {
    console.log(
      `[refresh-all] refreshed ${tokenRefresh.refreshed} Meta token(s)` +
        (tokenRefresh.failed.length > 0
          ? ` (${tokenRefresh.failed.length} failed)`
          : "")
    );
  }

  // Find every store with at least a Shopify connection. Meta/Instagram/
  // BixGrow are optional — we skip those when no connection row exists.
  const stores = (await db.store.findMany({
    where: { connected: true },
    select: { id: true, name: true, domain: true }
  })) as Array<{ id: string; name: string | null; domain: string }>;

  if (stores.length === 0) {
    return NextResponse.json({
      ok: true,
      stores: 0,
      message: "No connected stores.",
      tokenRefresh
    });
  }

  const results: PerStoreResult[] = await Promise.all(
    stores.map(async (store) => {
      const result: PerStoreResult = {
        storeId: store.id,
        storeName: store.name,
        shopify: { ok: false },
        metaAds: { ok: false },
        instagram: { ok: false },
        bixgrow: { ok: true, skipped: true },
        gsc: { ok: true, skipped: true },
        competitors: { ok: true, skipped: true }
      };

      // ── Shopify (mandatory if connected) ──────────────────────────
      try {
        await runIncrementalSync(store.id);
        result.shopify = { ok: true };
      } catch (err) {
        // 409 = a sync is already running for this store — that's not a
        // failure, just expected when ticks overlap with a manual sync.
        const isConflict =
          err instanceof Error && err.message.includes("already running");
        result.shopify = isConflict
          ? { ok: true, skipped: true }
          : { ok: false, error: err instanceof Error ? err.message : String(err) };
      }

      // ── Reconcile affiliate attribution orphans ───────────────────
      // Whether Shopify sync succeeded or was skipped (already running),
      // we still try to link any orphaned AffiliateAttribution rows
      // whose matching Order has now arrived. Skip only on hard failure.
      if (result.shopify.ok) {
        try {
          const reconcile = await reconcileAffiliateAttributionOrphans(store.id);
          result.affiliateReconcile = {
            linked: reconcile.linked,
            deletedDuplicates: reconcile.deletedDuplicates,
            stillOrphan: reconcile.stillOrphan
          };
          if (reconcile.linked > 0 || reconcile.deletedDuplicates > 0) {
            console.log(
              `[refresh-all] store=${store.id} reconciled ${reconcile.linked} orphan(s)` +
                (reconcile.deletedDuplicates > 0
                  ? `, deleted ${reconcile.deletedDuplicates} duplicate(s)`
                  : "")
            );
          }
        } catch (err) {
          console.error(`[refresh-all] reconcile failed for ${store.id}:`, err);
        }

        // ── Affiliate attribution backfill ──────────────────────────
        // Coupon/ref-matching over recently synced orders. This is the
        // safety net for conversions the order webhook missed (webhook not
        // yet registered, delivery failed, or the shopper's browser never
        // ran the tracking snippet but used an affiliate coupon). It is
        // CREATE-ONLY (never rewrites webhook/BixGrow/manual rows) and
        // windowed to 30 days — older orders were covered by prior ticks;
        // a full-history pass is still available via the portal's manual
        // "Sync affiliate attributions" button.
        try {
          const { syncAffiliateAttributionFromOrders } = await import(
            "@/lib/services/affiliate-portal-admin-service"
          );
          const affiliateSync = await syncAffiliateAttributionFromOrders(store.id, {
            since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          });
          result.affiliateSync = { syncedOrders: affiliateSync.syncedOrders };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.affiliateSync = { syncedOrders: 0, error: message };
          console.error(`[refresh-all] affiliate sync failed for ${store.id}:`, err);
        }
      }

      // ── Meta Ads (optional) ───────────────────────────────────────
      const metaConn = await db.metaAdsConnection
        .findUnique({ where: { storeId: store.id }, select: { id: true } })
        .catch(() => null);
      if (!metaConn) {
        result.metaAds = { ok: true, skipped: true };
      } else {
        try {
          await syncMetaAdsCampaignInsights({ storeId: store.id });
          result.metaAds = { ok: true };
        } catch (err) {
          result.metaAds = {
            ok: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      // ── Instagram (optional) ──────────────────────────────────────
      const igConn = await db.instagramConnection
        .findFirst({ where: { storeId: store.id }, select: { id: true } })
        .catch(() => null);
      if (!igConn) {
        result.instagram = { ok: true, skipped: true };
      } else {
        try {
          // storeId-scoped sync: each iteration syncs THIS store's Instagram
          // posts using the token stored on its own InstagramConnection row.
          // (Previously syncInstagramPosts() resolved a single "base"/"current"
          // store via context, so in multi-tenant mode only one store synced.)
          await syncInstagramPostsForStore(store.id);
          result.instagram = { ok: true };
        } catch (err) {
          result.instagram = {
            ok: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      // ── Google Search Console (optional) ─────────────────────────
      // GSC sync requires: (a) a PlatformConnection row (platform =
      // "googleSearchConsole") with status "connected", AND (b) the owner
      // has performed the OAuth consent flow. Failures are isolated —
      // GSC not being configured must never block Shopify / Meta / Instagram.
      // The siteUrl is derived from the store's Shopify domain using the
      // GSC domain property format ("sc-domain:<domain>").
      const gscConn = await db.platformConnection
        .findUnique({
          where: { storeId_platform: { storeId: store.id, platform: GSC_PLATFORM } },
          select: { id: true, status: true }
        })
        .catch(() => null);
      if (!gscConn || gscConn.status !== "connected") {
        result.gsc = { ok: true, skipped: true };
      } else {
        try {
          // Derive siteUrl from the store domain. GSC domain properties use
          // the "sc-domain:<domain>" format (supports all URL prefixes under
          // that domain). Falls back gracefully if syncGscData throws.
          const siteUrl = `sc-domain:${store.domain}`;
          const gscResult = await syncGscData(store.id, siteUrl);
          result.gsc = {
            ok: true,
            pagesUpserted: gscResult.pagesUpserted,
            queriesUpserted: gscResult.queriesUpserted
          };
        } catch (err) {
          // GSC failures are non-fatal. OAuth may not be configured yet,
          // the site may not be verified, or the env vars may be missing.
          console.error(`[refresh-all] GSC sync failed for ${store.id}:`, err);
          result.gsc = {
            ok: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      // ── Competitor signals (optional) ─────────────────────────────
      // Runs only for stores that defined a competitor set (max 5 active,
      // settings page). Pulls RivalSweeper Feed A — or the deterministic
      // mock until real credentials arrive — and upserts one snapshot per
      // competitor per day, feeding the weekly report's competitors section.
      const hasCompetitors = await db.competitor
        .findFirst({ where: { storeId: store.id, status: "active" }, select: { id: true } })
        .catch(() => null);
      if (!hasCompetitors) {
        result.competitors = { ok: true, skipped: true };
      } else {
        try {
          const compResult = await syncCompetitorSignals(store.id);
          // Fresh snapshots in hand — turn actionable competitor moves
          // (opened promo / deepened discount) into open alerts so they
          // land in the Command Center approve/resolve queue.
          const alertResult = await upsertCompetitorResponseAlerts({
            storeId: store.id,
            start: new Date(Date.now() - 7 * 86_400_000),
            end: new Date()
          }).catch((err) => {
            console.error(`[refresh-all] competitor alert engine failed for ${store.id}:`, err);
            return { alertsUpserted: 0 };
          });
          result.competitors = {
            ok: true,
            snapshotsUpserted: compResult.snapshotsUpserted,
            alertsUpserted: alertResult.alertsUpserted
          };
        } catch (err) {
          console.error(`[refresh-all] competitor sync failed for ${store.id}:`, err);
          result.competitors = {
            ok: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      return result;
    })
  );

  // Compact summary for the cron's heartbeat log
  const totalOk = results.filter(
    (r) => r.shopify.ok && r.metaAds.ok && r.instagram.ok
  ).length;
  const totalFailed = results.length - totalOk;

  return NextResponse.json({
    ok: totalFailed === 0,
    stores: results.length,
    summary: {
      allOk: totalOk,
      withFailures: totalFailed
    },
    tokenRefresh,
    results
  });
}

export { handler as GET, handler as POST };
