// GET /api/gantt/[sheetId]/plan/entity-search?kind=product|gift_product|discount|meta_campaign&q=…
// Manual candidate search for the initiative context flow: catalogue
// products by title, discount codes seen on orders, Meta campaigns by name.
// Read-only; scoped to the active store.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sheetId: string }> }) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
    const db = getDb() as any;
    const owned = await db.ganttSheet.findFirst({ where: { id: sheetId, storeId }, select: { id: true } });
    if (!owned) throw new AppError("Sheet not found.", 404);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "product";
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

    let results: Array<{ id: string; label: string; detail?: string }> = [];
    if (kind === "product" || kind === "gift_product") {
      const rows = (await db.product.findMany({ where: { storeId, title: { contains: q, mode: "insensitive" } }, select: { id: true, title: true, variants: { select: { inventoryQuantity: true, sku: true } } }, take: 15, orderBy: { title: "asc" } })) as Array<{ id: string; title: string; variants: Array<{ inventoryQuantity: number | null; sku: string | null }> }>;
      results = rows.map((p) => ({ id: p.id, label: p.title, detail: `${p.variants.reduce((n, v) => n + (v.inventoryQuantity ?? 0), 0)} in stock${p.variants[0]?.sku ? ` · ${p.variants[0].sku}` : ""}` }));
    } else if (kind === "discount") {
      const rows = (await db.discountUsage.groupBy({ by: ["code"], where: { storeId, code: { contains: q, mode: "insensitive" } }, _count: { orderId: true }, orderBy: { _count: { orderId: "desc" } }, take: 15 })) as Array<{ code: string; _count: { orderId: number } }>;
      results = rows.map((r) => ({ id: r.code.toUpperCase(), label: r.code.toUpperCase(), detail: `${r._count.orderId} orders` }));
    } else if (kind === "meta_campaign") {
      const rows = (await db.metaAdsCampaignInsight.findMany({ where: { storeId, level: "campaign", campaignName: { contains: q, mode: "insensitive" } }, distinct: ["campaignId"], select: { campaignId: true, campaignName: true }, take: 15, orderBy: { dateStart: "desc" } })) as Array<{ campaignId: string; campaignName: string }>;
      results = rows.map((r) => ({ id: r.campaignId, label: r.campaignName }));
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
