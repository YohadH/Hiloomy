// GET   /api/affiliate-portal/campaigns/{id} — campaign + briefs (with ready links).
// PATCH /api/affiliate-portal/campaigns/{id} — update the campaign.
// POST  /api/affiliate-portal/campaigns/{id} — add briefs for one or many affiliates.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { addBriefs, getCampaign, updateCampaign, type BriefInput, type CampaignInput } from "@/lib/services/affiliate-campaign-service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

async function storeIdOrThrow() {
  const storeId = await resolveActiveStoreId();
  if (!storeId) throw new AppError("No active store.", 400);
  await assertStoreInActiveOrg(storeId);
  return storeId;
}

function fail(error: unknown) {
  const status = error instanceof AppError ? error.statusCode : 500;
  return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
}

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { campaignId } = await params;
    const storeId = await storeIdOrThrow();
    return NextResponse.json({ ok: true, campaign: await getCampaign(storeId, campaignId) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { campaignId } = await params;
    const storeId = await storeIdOrThrow();
    const body = (await request.json().catch(() => ({}))) as CampaignInput;
    return NextResponse.json({ ok: true, campaign: await updateCampaign(storeId, campaignId, body) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { campaignId } = await params;
    const storeId = await storeIdOrThrow();
    const body = (await request.json().catch(() => ({}))) as BriefInput;
    return NextResponse.json({ ok: true, ...(await addBriefs(storeId, campaignId, body)) });
  } catch (error) {
    return fail(error);
  }
}
