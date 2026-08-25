// POST /api/affiliate-portal/affiliates/{id}/login-link — the owner's
// no-email fallback (HLA-12/B8): mint a one-time magic login link for an
// affiliate, to be copied and sent manually (WhatsApp etc.). 15-minute TTL.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildOwnerLoginLink } from "@/lib/services/affiliate-signup-service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ affiliateId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const { affiliateId } = await params;
    const url = await buildOwnerLoginLink(storeId, affiliateId);
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
