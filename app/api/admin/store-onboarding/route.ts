import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { requireOrgAdmin } from "@/lib/auth/guards";
import {
  registerStoreOnboarding,
  listStoreOnboardings,
  type StoreOnboardingMode
} from "@/lib/services/store-onboarding-service";

export const dynamic = "force-dynamic";

// GET  → onboardings the operator has set up (for the Design partners list).
// POST → register a new store onboarding (creates org + invite for partners),
//        returns the install + invite links to hand out.
//
// Restricted to org owners/admins — this creates orgs and invitations.

export async function GET() {
  try {
    await requireOrgAdmin();
    const items = await listStoreOnboardings();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireOrgAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      brandName?: string;
      shopDomain?: string;
      clientId?: string;
      clientSecret?: string;
      mode?: string;
      partnerEmail?: string;
    };
    const mode: StoreOnboardingMode = body.mode === "own" ? "own" : "partner";
    const result = await registerStoreOnboarding({
      brandName: String(body.brandName ?? ""),
      shopDomain: String(body.shopDomain ?? ""),
      clientId: String(body.clientId ?? ""),
      clientSecret: String(body.clientSecret ?? ""),
      mode,
      partnerEmail: typeof body.partnerEmail === "string" ? body.partnerEmail : undefined
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
