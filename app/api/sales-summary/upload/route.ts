import { NextResponse } from "next/server";
import { parseOfflineSalesWorkbook } from "@/lib/server/offline-sales-excel-parser";
import { saveOfflineSalesUpload } from "@/lib/services/offline-sales-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveScopedStoreId } from "@/lib/auth/guards";

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("Upload an Excel file (.xlsx) first.", 400);
    }

    // This is a WRITE keyed by storeId — org-check it. Previously a
    // client-supplied storeId was trusted, letting one tenant write offline
    // sales into another tenant's brand. resolveScopedStoreId falls back to
    // the caller's active store and always asserts ownership.
    const storeIdField = formData.get("storeId");
    const storeId = await resolveScopedStoreId(
      typeof storeIdField === "string" ? storeIdField : null
    );

    const buffer = await file.arrayBuffer();
    const parsed = parseOfflineSalesWorkbook(buffer);

    const yearField = formData.get("periodYear");
    const monthField = formData.get("periodMonth");
    const periodYear = typeof yearField === "string" && yearField ? Number(yearField) : parsed.detectedYear;
    const periodMonth = typeof monthField === "string" && monthField ? Number(monthField) : parsed.detectedMonth;

    if (!periodYear || !Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) {
      throw new AppError("Provide a valid year for this upload.", 400);
    }
    if (!periodMonth || !Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
      throw new AppError("Provide a valid month (1-12) for this upload.", 400);
    }

    const currencyField = formData.get("currency");
    const currency = typeof currencyField === "string" && currencyField.trim() ? currencyField.trim() : null;

    const saved = await saveOfflineSalesUpload({
      storeId,
      fileName: file.name,
      parsed,
      periodYear,
      periodMonth,
      currency
    });

    return NextResponse.json({
      ok: true,
      import: saved,
      detected: { year: parsed.detectedYear, month: parsed.detectedMonth, sheetTitle: parsed.sheetTitle }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
