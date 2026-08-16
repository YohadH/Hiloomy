import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { setProductCost } from "@/lib/services/product-cost-service";

// Product cost (COGS) editor endpoint — SA-HIGH-03.
//
// POST sets (or clears, with cost: null) the manual per-unit COGS for a single
// product and re-costs its already-synced order line items so the Profit page
// updates immediately.
//
// The target store is resolved SERVER-SIDE from the caller's active session —
// the client never supplies a storeId — so a caller can only ever edit the
// store they're already viewing. `setProductCost` additionally verifies the
// productId belongs to that store before writing.
//
// Body: { productId: string, cost: number | null }

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const body = (await request.json().catch(() => ({}))) as {
      productId?: unknown;
      cost?: unknown;
    };

    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productId) throw new AppError("productId is required.", 400);

    // `cost` may be null/"" (clear the override) or a non-negative number.
    let cost: number | null;
    if (body.cost == null || body.cost === "") {
      cost = null;
    } else {
      const n = typeof body.cost === "number" ? body.cost : Number(body.cost);
      if (!Number.isFinite(n) || n < 0) throw new AppError("cost must be a number ≥ 0.", 400);
      cost = n;
    }

    const result = await setProductCost({ storeId, productId, costOverrideAmount: cost });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
