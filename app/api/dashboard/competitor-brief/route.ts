// POST /api/dashboard/competitor-brief — the client loader for the
// competitors section. BLOCKS until the BI brief is generated (or served
// from cache), so the dashboard can show a spinner and swap in the real
// analysis, the same UX as the Meta campaigns insight — instead of the
// static "BI unavailable" fallback banner.

import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getCompetitorBriefBlocking } from "@/lib/services/competitor-brief-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    const locale = auth.locale === "he" ? "he" : "en";
    const brief = await getCompetitorBriefBlocking(storeId ?? undefined, locale);
    if (!brief) return NextResponse.json({ ok: false, error: "no_competitor_set" }, { status: 404 });
    return NextResponse.json({ ok: true, brief });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
