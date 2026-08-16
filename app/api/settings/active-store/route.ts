import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { ACTIVE_STORE_COOKIE } from "@/lib/services/offline-sales-service";

// POST /api/settings/active-store
// Body: { storeId: string }
//
// Sets the active-store cookie. The StoreSwitcher dropdown calls this when
// the operator picks a different brand to view. Every page that reads
// resolveActiveStoreId() will see the new value on next render.
//
// Validation: the store must exist before we set the cookie. We don't want
// the page to crash trying to load data for a store that was deleted.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as { storeId?: string };
    const storeId = body.storeId?.trim();
    if (!storeId) {
      throw new AppError("storeId is required.", 400);
    }

    const db = getDb();
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, domain: true }
    });
    if (!store) {
      throw new AppError("Store not found.", 404);
    }

    const response = NextResponse.json({ ok: true, store });
    response.cookies.set(ACTIVE_STORE_COOKIE, store.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // 30 days — long enough that the operator's pick sticks across sessions
      // without keeping a stale value forever if they stop using the app.
      maxAge: 60 * 60 * 24 * 30
    });
    return response;
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
