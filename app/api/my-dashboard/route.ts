import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveScopedStoreId } from "@/lib/auth/guards";
import {
  addWatchedProduct,
  buildCustomDashboard,
  removeWatchedProduct,
  setWatchedProductThreshold
} from "@/lib/services/custom-dashboard-service";

// GET  /api/my-dashboard                       → the board with live numbers
// POST /api/my-dashboard { action: "add" | "remove" | "threshold", productId, threshold? }

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storeId = await resolveScopedStoreId(undefined);
    return NextResponse.json({ ok: true, ...(await buildCustomDashboard(storeId)) });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; productId?: string; threshold?: unknown };
    const storeId = await resolveScopedStoreId(undefined);
    const productId = String(body.productId ?? "").trim();
    if (!productId) throw new AppError("productId is required.", 400);
    if (body.action === "add") await addWatchedProduct(storeId, productId);
    else if (body.action === "remove") await removeWatchedProduct(storeId, productId);
    else if (body.action === "threshold") {
      const raw = body.threshold;
      const threshold = raw === null || raw === "" || raw === undefined ? null : Number(raw);
      if (threshold !== null && !Number.isFinite(threshold)) throw new AppError("threshold must be a number.", 400);
      await setWatchedProductThreshold(storeId, productId, threshold);
    } else throw new AppError("action must be add, remove or threshold.", 400);
    return NextResponse.json({ ok: true, ...(await buildCustomDashboard(storeId)) });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
