import { NextResponse } from "next/server";
import { runIncrementalSync } from "@/lib/services/shopify-sync-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await assertStoreInActiveOrg(body.storeId);
    const result = await runIncrementalSync(body.storeId);
    return NextResponse.json({ ok: true, syncRun: result });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
