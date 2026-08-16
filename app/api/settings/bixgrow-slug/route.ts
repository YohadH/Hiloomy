import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

// Update the bixgrowSlug for the currently-active store. The Settings
// page calls this when the operator edits the slug input.
//
// Slug format rules: 1-32 chars, lowercase alphanumerics + hyphens only,
// must not start/end with a hyphen. We coerce to that shape on save and
// reject if the input is empty after coercion.

export const dynamic = "force-dynamic";

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-") // anything else → hyphen
    .replace(/-+/g, "-") // collapse runs
    .replace(/^-+|-+$/g, "") // trim leading/trailing
    .slice(0, 32);
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const body = (await request.json().catch(() => ({}))) as { slug?: string };
    const requested = (body.slug ?? "").trim();
    if (!requested) throw new AppError("slug is required.", 400);

    const slug = sanitizeSlug(requested);
    if (!slug) {
      throw new AppError(
        "Slug must contain at least one letter or number after sanitization.",
        400
      );
    }

    const db = getDb();
    // Refuse if another store already claims this slug — globally unique.
    const collision = await db.store.findUnique({
      where: { bixgrowSlug: slug },
      select: { id: true }
    });
    if (collision && collision.id !== storeId) {
      throw new AppError(
        `Slug "${slug}" is already in use by another brand. Pick a different one.`,
        409
      );
    }

    await db.store.update({
      where: { id: storeId },
      data: { bixgrowSlug: slug }
    });

    return NextResponse.json({ ok: true, slug });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
