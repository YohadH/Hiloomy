import { NextResponse } from "next/server";
import { importAffiliatesFromFile } from "@/lib/services/affiliate-portal-directory-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const rawStoreId = formData.get("storeId");

    if (!(file instanceof File)) {
      throw new AppError("Upload an Excel, CSV, or JSON file first.", 400);
    }

    // Writes affiliates into a store — resolve the target (explicit form
    // storeId, else the caller's active store) and assert org ownership.
    const storeId: string | undefined =
      typeof rawStoreId === "string" && rawStoreId
        ? rawStoreId
        : ((await resolveActiveStoreId()) ?? undefined);
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const result = await importAffiliatesFromFile(file, storeId);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
