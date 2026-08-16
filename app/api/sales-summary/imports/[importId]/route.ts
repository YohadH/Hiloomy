import { NextResponse } from "next/server";
import {
  deleteOfflineSalesImport,
  getOfflineSalesSummary,
  resolveActiveStoreId
} from "@/lib/services/offline-sales-service";
import { toErrorMessage } from "@/lib/server/errors";
import { getAppLocale } from "@/lib/i18n";
import { getAuthContext } from "@/lib/auth/session";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { importId } = await params;
    const [storeId, locale] = await Promise.all([resolveActiveStoreId(), getAppLocale()]);
    if (!storeId) return NextResponse.json({ ok: false, error: "No store available." }, { status: 404 });
    const summary = await getOfflineSalesSummary(importId, storeId, locale);
    if (!summary) return NextResponse.json({ ok: false, error: "Import not found." }, { status: 404 });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { importId } = await params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) return NextResponse.json({ ok: false, error: "No store available." }, { status: 404 });
    await deleteOfflineSalesImport(importId, storeId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
