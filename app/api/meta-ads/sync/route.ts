import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { syncMetaAdsCampaignInsights } from "@/lib/services/meta-ads-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId === "string" && body.storeId) {
      await assertStoreInActiveOrg(body.storeId);
    }
    const result = await syncMetaAdsCampaignInsights({
      storeId: typeof body.storeId === "string" ? body.storeId : null,
      datePreset: typeof body.datePreset === "string" ? body.datePreset : "last_30d"
    });

    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
