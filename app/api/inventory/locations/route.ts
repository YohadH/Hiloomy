import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveScopedStoreId } from "@/lib/auth/guards";
import {
  applyInventoryLocationSelection,
  assertLocationIds,
  getInventoryLevelsSyncedAt,
  getSelectedInventoryLocations,
  listShopifyLocations,
  setSelectedInventoryLocations,
  syncInventoryLevels
} from "@/lib/services/inventory-locations-service";

// GET  /api/inventory/locations?storeId=…        → locations, current selection, last levels sync
// POST /api/inventory/locations { storeId?, locationIds: string[] } → save selection, re-apply
// POST /api/inventory/locations { storeId?, sync: true }             → pull levels from Shopify now

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = await resolveScopedStoreId(url.searchParams.get("storeId"));
    const refresh = url.searchParams.get("refresh") === "1";
    const [{ locations, error }, selected, syncedAt] = await Promise.all([
      listShopifyLocations(storeId, { refresh }),
      getSelectedInventoryLocations(storeId),
      getInventoryLevelsSyncedAt(storeId)
    ]);
    return NextResponse.json({ ok: true, locations, selected, syncedAt, error });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { storeId?: string; locationIds?: unknown; sync?: boolean };
    const storeId = await resolveScopedStoreId(body.storeId);
    if (body.sync) {
      const result = await syncInventoryLevels(storeId);
      return NextResponse.json({ ok: true, ...result });
    }
    const locationIds = assertLocationIds(body.locationIds);
    await setSelectedInventoryLocations(storeId, locationIds);
    const applied = await applyInventoryLocationSelection(storeId);
    return NextResponse.json({ ok: true, selected: locationIds, ...applied });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
