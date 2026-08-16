import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/auth/guards";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as {
      displayName?: string;
      locale?: string;
    };

    const displayName = (body.displayName ?? "").trim().slice(0, 80) || null;
    const locale = body.locale === "en" ? "en" : "he";

    const db = getDb();
    await db.user.update({
      where: { id: userId },
      data: { displayName, locale }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
