// GET/POST /api/affiliate-portal/tracking-script — storefront tracking
// install for cross-session link attribution (BixGrow parity).
// GET: is the ScriptTag installed on the connected shop?
// POST: install it via the Admin API; a failure is returned WITH the manual
// snippet so the settings card can fall back to paste-into-theme.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  getTrackingScriptStatus,
  installTrackingScriptTag,
  trackingSnippetHtml
} from "@/lib/services/affiliate-tracking-install-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    const status = await getTrackingScriptStatus(storeId);
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

export async function POST() {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    const result = await installTrackingScriptTag(storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json(
      { ok: false, error: toErrorMessage(error), snippet: trackingSnippetHtml() },
      { status }
    );
  }
}
