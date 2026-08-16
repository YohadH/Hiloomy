import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { crawlPublicInstagramProfiles } from "@/lib/services/instagram-public-crawler-service";
import { getAuthContext } from "@/lib/auth/session";

function parseHandles(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const result = await crawlPublicInstagramProfiles({
      storeId: typeof body.storeId === "string" ? body.storeId : null,
      brandUsername: typeof body.brandUsername === "string" ? body.brandUsername : "incenseparfums",
      creatorHandles: parseHandles(body.creatorHandles),
      brandLimit: Number.isFinite(Number(body.brandLimit)) ? Number(body.brandLimit) : null,
      creatorLimit: Number.isFinite(Number(body.creatorLimit)) ? Number(body.creatorLimit) : null
    });

    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
