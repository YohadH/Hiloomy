// GET/POST /api/affiliate-portal/signup-settings — the owner's control
// panel for in-app affiliate signup (HLA-12/B7): public slug, branding,
// auto-approve, commission rate, terms. Saving a slug is what turns the
// /join, /r and /my doors on (and regenerates every member's tracked link).

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getSignupSettings, updateSignupSettings } from "@/lib/services/affiliate-signup-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    const settings = await getSignupSettings(storeId);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const body = (await request.json().catch(() => ({}))) as {
      signupSlug?: string;
      autoApprove?: boolean;
      commissionRatePct?: number;
      brandLogoUrl?: string | null;
      brandAccentColor?: string | null;
      signupHeadline?: string | null;
      signupCopy?: string | null;
      termsText?: string | null;
    };

    const settings = await updateSignupSettings(storeId, body);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
