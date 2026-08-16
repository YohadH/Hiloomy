// Affiliate attribution reconciler.
//
// Two timing windows can produce a "dirty" AffiliateAttribution state:
//
//   A. Order syncs from Shopify FIRST, then BixGrow webhook fires.
//      → Clean by construction — the webhook finds the order and links it.
//
//   B. BixGrow webhook fires BEFORE Shopify has pulled the order.
//      → AffiliateAttribution is created with orderId=null. When Shopify
//        sync later pulls the order, the orphan is NOT auto-linked.
//
//   B'. BixGrow then re-delivers (it does, on status changes) AFTER the
//       Shopify order has arrived. The webhook's matched-order code path
//       creates a NEW row (because the orphan has orderId=null, so the
//       composite unique key (affiliateMemberId, orderId) sees a different
//       key). Result: duplicate.
//
// This reconciler closes both gaps:
//
//   1. For each orphan AffiliateAttribution in the store with an
//      externalOrderNumber set:
//      - If the matching Shopify Order now exists AND no matched row
//        exists for the same (affiliateMember, order) → link the orphan.
//      - If a matched row already exists → delete the orphan (it's a dup).
//
// Called from:
//   - The 2h refresh-all cron, after Shopify sync completes for a store
//   - The BixGrow webhook handler, in the matched-order branch
//
// Idempotent — running twice is a no-op.

import { getDb } from "@/lib/server/db";

export interface ReconcileResult {
  scanned: number;
  linked: number;
  deletedDuplicates: number;
  stillOrphan: number;
}

function stripHash(value: string | null | undefined): string {
  return String(value ?? "").replace(/^#/, "").trim();
}

export async function reconcileAffiliateAttributionOrphans(
  storeId: string,
  options?: { orderNumber?: string | null }
): Promise<ReconcileResult> {
  const db = getDb();
  const result: ReconcileResult = {
    scanned: 0,
    linked: 0,
    deletedDuplicates: 0,
    stillOrphan: 0
  };

  const targetNumber = options?.orderNumber ? stripHash(options.orderNumber) : null;

  // Pull all orphan rows in this store (filter by orderNumber if specified
  // — the webhook calls this for a single order, the cron for all).
  const orphans = (await db.affiliateAttribution.findMany({
    where: {
      storeId,
      orderId: null,
      externalOrderNumber: { not: null },
      ...(targetNumber
        ? {
            OR: [
              { externalOrderNumber: targetNumber },
              { externalOrderNumber: `#${targetNumber}` }
            ]
          }
        : {})
    },
    select: {
      id: true,
      externalOrderNumber: true,
      affiliateMemberId: true
    }
  })) as Array<{ id: string; externalOrderNumber: string | null; affiliateMemberId: string }>;

  result.scanned = orphans.length;
  if (orphans.length === 0) return result;

  // Batch-load every matching Order in one query to keep this O(N+M)
  // rather than O(N×M). Strip the leading "#" so we match Shopify's
  // canonical orderNumber regardless of how BixGrow formatted it.
  const candidateNumbers = Array.from(
    new Set(orphans.flatMap((o) => {
      const n = stripHash(o.externalOrderNumber);
      return [n, `#${n}`];
    }))
  );
  const orders = (await db.order.findMany({
    where: {
      storeId,
      orderNumber: { in: candidateNumbers }
    },
    select: { id: true, orderNumber: true }
  })) as Array<{ id: string; orderNumber: string }>;

  const orderByNumber = new Map<string, string>();
  for (const o of orders) orderByNumber.set(stripHash(o.orderNumber), o.id);

  for (const orphan of orphans) {
    const clean = stripHash(orphan.externalOrderNumber);
    const orderId = orderByNumber.get(clean);
    if (!orderId) {
      result.stillOrphan += 1;
      continue;
    }

    // Is there already a matched row for this (affiliateMember, order)?
    // If yes, the orphan is a leftover duplicate from before BixGrow
    // re-delivered. Delete it. Otherwise, link the orphan.
    const existingMatched = (await db.affiliateAttribution.findFirst({
      where: {
        storeId,
        affiliateMemberId: orphan.affiliateMemberId,
        orderId
      },
      select: { id: true }
    })) as { id: string } | null;

    if (existingMatched) {
      await db.affiliateAttribution.delete({ where: { id: orphan.id } });
      result.deletedDuplicates += 1;
    } else {
      await db.affiliateAttribution.update({
        where: { id: orphan.id },
        data: { orderId }
      });
      result.linked += 1;
    }
  }

  return result;
}
