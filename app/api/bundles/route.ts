import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  getBundleOverview,
  removeBundleComponent,
  setBundleComponent
} from "@/lib/services/bundle-profitability-service";

export const dynamic = "force-dynamic";

async function requireStoreId(): Promise<string> {
  const auth = await getAuthContext();
  if (!auth.userId) throw new AppError("Unauthorized.", 401);
  const storeId = await resolveActiveStoreId();
  if (!storeId) throw new AppError("No active store.", 400);
  return storeId;
}

export async function GET() {
  try {
    const storeId = await requireStoreId();
    const overview = await getBundleOverview(storeId);
    return NextResponse.json({ ok: true, ...overview });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}

export async function POST(request: Request) {
  try {
    const storeId = await requireStoreId();
    const body = (await request.json()) as {
      bundleProductId?: string;
      componentProductId?: string;
      quantity?: number;
    };
    await setBundleComponent(storeId, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}

export async function DELETE(request: Request) {
  try {
    const storeId = await requireStoreId();
    const body = (await request.json()) as { id?: string };
    if (!body.id || typeof body.id !== "string") throw new AppError("id is required.", 400);
    await removeBundleComponent(storeId, body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
