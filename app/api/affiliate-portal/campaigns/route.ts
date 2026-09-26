// GET  /api/affiliate-portal/campaigns  — list campaigns with clicks/orders/sales.
// POST /api/affiliate-portal/campaigns  — create a campaign (owner-authenticated).

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { createCampaign, listCampaigns, type CampaignInput } from "@/lib/services/affiliate-campaign-service";

export const dynamic = "force-dynamic";

async function storeIdOrThrow() {
  const storeId = await resolveActiveStoreId();
  if (!storeId) throw new AppError("No active store.", 400);
  await assertStoreInActiveOrg(storeId);
  return storeId;
}

export async function GET() {
  try {
    const storeId = await storeIdOrThrow();
    return NextResponse.json({ ok: true, campaigns: await listCampaigns(storeId) });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const storeId = await storeIdOrThrow();
    const body = (await request.json().catch(() => ({}))) as CampaignInput;
    const campaign = await createCampaign(storeId, body);
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
