import { Prisma } from "@prisma/client";
import { getDb, withOptionalDb } from "@/lib/server/db";
import type { ParsedOfflineSalesSheet } from "@/lib/server/offline-sales-excel-parser";

// Cookie name read by resolveActiveStoreId — set by /api/settings/active-store
// when the operator picks a brand in the StoreSwitcher. httpOnly so it can't
// be tampered with from client JS.
export const ACTIVE_STORE_COOKIE = "active_store_id";

export async function resolveActiveStoreId(): Promise<string | null> {
  // Multi-tenant resolution path. Priority:
  //   1. Auth context (signed-in user + their active org) — if available,
  //      honor the cookie-or-first-store WITHIN that org.
  //   2. Legacy fallback for non-authenticated contexts (webhooks, crons,
  //      background jobs) — pick the most recently updated connected store
  //      anywhere. This keeps cron paths working until 1E sweep promotes
  //      them all to org-aware.
  try {
    const { getAuthContext } = await import("@/lib/auth/session");
    const auth = await getAuthContext();
    if (auth.orgId) {
      // Honor the user's active store within their active org.
      return auth.storeId ?? null;
    }
  } catch {
    // No auth context (e.g. webhook handler). Fall through to legacy path.
  }

  // Legacy path — single-tenant fallback. Kept until every caller is
  // org-aware.
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(ACTIVE_STORE_COOKIE)?.value?.trim();
  if (fromCookie) {
    const exists = await withOptionalDb<{ id: string } | null>(
      (db) => db.store.findUnique({ where: { id: fromCookie }, select: { id: true } }),
      null
    );
    if (exists) return exists.id;
  }
  return withOptionalDb(async (db) => {
    const connected = await db.store.findFirst({
      where: { connected: true, connection: { isNot: null } },
      orderBy: { updatedAt: "desc" },
      select: { id: true }
    });
    if (connected) return connected.id;
    const any = await db.store.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } });
    return any?.id ?? null;
  }, null);
}

// Read-only list of every store the operator has installed, used by the
// StoreSwitcher to render its dropdown. In SaaS mode this is scoped to
// the active org of the signed-in user — they only ever see their own
// brands.
//
// Fail-closed rule: when auth RESOLVES but the user has no org (they're
// mid-onboarding, or their membership was revoked), return an EMPTY list —
// never the unscoped all-stores query. The previous behavior fell through
// to "all stores in the database" for a null orgId, which in multi-tenant
// SaaS is Tenant A seeing Tenant B's brand names in the switcher. The
// unscoped path survives ONLY when the auth module itself is unavailable
// (dev/CI without Supabase configured — single-tenant legacy mode).
export async function listAllStoresForSwitcher(): Promise<
  Array<{ id: string; name: string; domain: string; connected: boolean }>
> {
  let scopeOrgId: string | null = null;
  let authResolved = false;
  try {
    const { getAuthContext } = await import("@/lib/auth/session");
    const auth = await getAuthContext();
    authResolved = true;
    scopeOrgId = auth.orgId;
  } catch {
    // Auth module unavailable — legacy single-tenant behavior below.
  }

  if (authResolved && !scopeOrgId) return [];

  return withOptionalDb(
    async (db) => {
      const rows = (await db.store.findMany({
        where: scopeOrgId ? { orgId: scopeOrgId } : undefined,
        orderBy: [{ connected: "desc" }, { updatedAt: "desc" }],
        select: { id: true, name: true, domain: true, connected: true }
      })) as Array<{ id: string; name: string; domain: string; connected: boolean }>;
      return rows;
    },
    []
  );
}

export interface SaveOfflineSalesUploadInput {
  storeId: string;
  fileName: string;
  parsed: ParsedOfflineSalesSheet;
  periodYear: number;
  periodMonth: number;
  currency?: string | null;
  notes?: string | null;
}

export interface OfflineSalesImportSummary {
  id: string;
  fileName: string;
  sheetTitle: string | null;
  periodYear: number;
  periodMonth: number;
  totalRows: number;
  totalQuantity: number;
  totalSales: number;
  currency: string | null;
  createdAt: string;
}

export interface OfflineSalesPerProduct {
  barcode: string | null;
  itemName: string;
  matchedVariantId: string | null;
  matchedProductTitle: string | null;
  productStatus: string | null;
  offlineQuantity: number;
  offlineSales: number;
  onlineQuantity: number;
  onlineSales: number;
  totalQuantity: number;
  totalSales: number;
  matched: boolean;
  onlinePct: number;
  offlinePct: number;
  inventoryQuantity: number | null;
  dailyBurn: number;
  daysOfStock: number | null;
  stockRisk: boolean;
}

export interface UnmatchedOfflineRow {
  itemName: string;
  barcode: string | null;
  quantity: number;
  sales: number;
}

export interface OfflineSalesNarrative {
  headline: string;
  body: string;
  tone: "up" | "down" | "neutral";
}

export interface AffiliateHaloProduct {
  barcode: string | null;
  productTitle: string;
  onlineQuantity: number;
  onlineSales: number;
  offlineQuantity: number;
  offlineSales: number;
  haloRatio: number;
}

export interface AffiliateHaloEntry {
  affiliateMemberId: string;
  affiliateName: string;
  affiliateCode: string;
  couponCodes: string[];
  onlineSales: number;
  onlineOrders: number;
  onlineQuantity: number;
  haloOfflineSales: number;
  haloOfflineQuantity: number;
  directOfflineSales: number;
  directOfflineQuantity: number;
  directRowCount: number;
  haloRatio: number;
  topProducts: AffiliateHaloProduct[];
}

export interface AffiliateHaloSummary {
  hasCouponColumn: boolean;
  storeOfflineToOnlineRatio: number;
  totalOnlineSales: number;
  totalDirectOfflineSales: number;
  affiliates: AffiliateHaloEntry[];
}

export interface OfflineSalesSummaryResponse {
  import: OfflineSalesImportSummary;
  totals: {
    offlineQuantity: number;
    offlineSales: number;
    onlineQuantity: number;
    onlineSales: number;
    totalQuantity: number;
    totalSales: number;
    offlineShare: number;
    onlineShare: number;
  };
  matchedRows: number;
  unmatchedRows: number;
  rows: OfflineSalesPerProduct[];
  storeHeroes: OfflineSalesPerProduct[];
  webHeroes: OfflineSalesPerProduct[];
  // Top products by ONLINE revenue (Shopify orders only, regardless of
  // whether the product also has offline sales). Mirrors Shopify
  // Analytics' "Total sales by product" chart so the founder can sanity-
  // check the report side-by-side. Computed independently from the
  // hero classification, so an INTENSE 50 that's 70% online still shows
  // up here even though it doesn't qualify as a ≥80% web hero.
  topOnlineProducts: Array<{
    productId: string;
    productTitle: string;
    units: number;
    revenue: number;
  }>;
  unmatched: UnmatchedOfflineRow[];
  stockRisk: { count: number; threshold: number };
  narrative: OfflineSalesNarrative;
  affiliateHalo: AffiliateHaloSummary;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}

function periodBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

function mapImportRecord(record: any): OfflineSalesImportSummary {
  return {
    id: record.id,
    fileName: record.fileName,
    sheetTitle: record.sheetTitle ?? null,
    periodYear: record.periodYear,
    periodMonth: record.periodMonth,
    totalRows: record.totalRows,
    totalQuantity: decimalToNumber(record.totalQuantity),
    totalSales: decimalToNumber(record.totalSales),
    currency: record.currency ?? null,
    createdAt: record.createdAt.toISOString()
  };
}

export async function saveOfflineSalesUpload(
  input: SaveOfflineSalesUploadInput
): Promise<OfflineSalesImportSummary> {
  const db = getDb();
  const { storeId, fileName, parsed, periodYear, periodMonth, currency, notes } = input;

  const totalQuantity = parsed.rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalSales = parsed.rows.reduce((sum, row) => sum + row.sales, 0);

  // Match each row to a ProductVariant by barcode (per store).
  const barcodes = Array.from(
    new Set(parsed.rows.map((row) => row.barcode).filter((b): b is string => Boolean(b && b.trim())))
  );
  const variants = barcodes.length
    ? await db.productVariant.findMany({
        where: { storeId, barcode: { in: barcodes } },
        select: { id: true, productId: true, barcode: true }
      })
    : [];
  const variantsByBarcode = new Map<string, { id: string; productId: string }>();
  for (const v of variants) {
    if (v.barcode) variantsByBarcode.set(v.barcode, { id: v.id, productId: v.productId });
  }

  const result = await db.$transaction(async (tx: any) => {
    // Replace any existing import for the same period.
    const existing = await tx.offlineSalesImport.findUnique({
      where: { storeId_periodYear_periodMonth: { storeId, periodYear, periodMonth } }
    });
    if (existing) {
      await tx.offlineSalesImport.delete({ where: { id: existing.id } });
    }

    const created = await tx.offlineSalesImport.create({
      data: {
        storeId,
        fileName,
        sheetTitle: parsed.sheetTitle,
        periodYear,
        periodMonth,
        totalRows: parsed.rows.length,
        totalQuantity: new Prisma.Decimal(totalQuantity.toFixed(2)),
        totalSales: new Prisma.Decimal(totalSales.toFixed(2)),
        currency: currency ?? null,
        notes: notes ?? null
      }
    });

    if (parsed.rows.length > 0) {
      await tx.offlineSalesRow.createMany({
        data: parsed.rows.map((row) => {
          const match = row.barcode ? variantsByBarcode.get(row.barcode) : undefined;
          return {
            importId: created.id,
            itemName: row.itemName,
            barcode: row.barcode,
            couponCode: row.couponCode,
            quantity: new Prisma.Decimal(row.quantity.toFixed(2)),
            sales: new Prisma.Decimal(row.sales.toFixed(2)),
            matchedVariantId: match?.id ?? null,
            matchedProductId: match?.productId ?? null
          };
        })
      });
    }

    return created;
  });

  return mapImportRecord(result);
}

export async function listOfflineSalesImports(storeId: string): Promise<OfflineSalesImportSummary[]> {
  return withOptionalDb(async (db) => {
    const records = await db.offlineSalesImport.findMany({
      where: { storeId },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { createdAt: "desc" }]
    });
    return records.map(mapImportRecord);
  }, []);
}

export async function deleteOfflineSalesImport(importId: string, storeId: string): Promise<void> {
  const db = getDb();
  await db.offlineSalesImport.deleteMany({ where: { id: importId, storeId } });
}

export async function getOfflineSalesSummary(
  importId: string,
  storeId: string,
  locale: "en" | "he" = "en"
): Promise<OfflineSalesSummaryResponse | null> {
  const db = getDb();

  const importRecord = await db.offlineSalesImport.findFirst({
    where: { id: importId, storeId },
    include: { rows: true }
  });
  if (!importRecord) return null;

  const { start, end } = periodBounds(importRecord.periodYear, importRecord.periodMonth);

  // Aggregate online sales for the period, grouped by variant.
  // CRITICAL FILTERS (added 2026-06-07): exclude cancelled + test orders so
  // the online total reconciles with the Overview KPI. Without these the
  // "Online sales" number on this page can be 30-40% higher than reality.
  // We also sum `lineDiscountAmount` per variant so the per-product revenue
  // can be netted out (matches Shopify's "Net sales" walk per line).
  const onlineByVariant = await db.orderLineItem.groupBy({
    by: ["variantId"],
    where: {
      storeId,
      order: {
        createdAt: { gte: start, lt: end },
        cancelledAt: null,
        test: false
      },
      variantId: { not: null }
    },
    _sum: { quantity: true, lineSubtotal: true, lineDiscountAmount: true }
  });

  // Live re-match: query the current ProductVariant table for any barcode in this import.
  // This ensures matching works even if the upload happened before product barcodes were synced.
  const offlineBarcodesNormalized = Array.from(
    new Set(
      importRecord.rows
        .map((r: any) => (typeof r.barcode === "string" ? r.barcode.trim() : ""))
        .filter((b: string) => b.length > 0)
    )
  );

  // Collect all variant IDs we'll need: online aggregations + persisted offline matches.
  const variantIdSet = new Set<string>();
  for (const row of onlineByVariant) {
    if (row.variantId) variantIdSet.add(row.variantId);
  }
  for (const row of importRecord.rows) {
    if (row.matchedVariantId) variantIdSet.add(row.matchedVariantId);
  }

  // Pull live variant rows whose barcode is in the offline file.
  const liveBarcodeMatches = offlineBarcodesNormalized.length
    ? await db.productVariant.findMany({
        where: { storeId, barcode: { in: offlineBarcodesNormalized } },
        select: { id: true }
      })
    : [];
  for (const v of liveBarcodeMatches) variantIdSet.add(v.id);

  const variantIds = Array.from(variantIdSet);

  const variantInfo = variantIds.length
    ? await db.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          barcode: true,
          title: true,
          inventoryQuantity: true,
          product: { select: { title: true, status: true } }
        }
      })
    : [];
  const variantById = new Map<
    string,
    {
      barcode: string | null;
      title: string;
      productTitle: string;
      inventoryQuantity: number | null;
      productStatus: string | null;
    }
  >();
  const variantIdByBarcode = new Map<string, string>();
  for (const v of variantInfo) {
    variantById.set(v.id, {
      barcode: v.barcode ?? null,
      title: v.title,
      productTitle: v.product?.title ?? v.title,
      inventoryQuantity: v.inventoryQuantity ?? null,
      productStatus: v.product?.status ?? null
    });
    if (v.barcode) variantIdByBarcode.set(v.barcode.trim(), v.id);
  }

  // Group online totals by barcode (rows without barcode are kept under a synthetic key).
  const onlineByBarcode = new Map<string, { quantity: number; revenue: number; productTitle: string }>();
  let onlineTotalQuantity = 0;
  let onlineTotalSales = 0;
  for (const agg of onlineByVariant) {
    const variantInfo = agg.variantId ? variantById.get(agg.variantId) : undefined;
    const qty = Number(agg._sum.quantity ?? 0);
    // Net of per-line discount so this matches Shopify "Net sales" per line.
    // This is the same line revenue Shopify-parity computes as
    //   grossSales − discounts
    // at the order level, just bucketed per variant.
    const gross = decimalToNumber(agg._sum.lineSubtotal);
    const discount = decimalToNumber(agg._sum.lineDiscountAmount);
    const revenue = gross - discount;
    onlineTotalQuantity += qty;
    onlineTotalSales += revenue;
    if (variantInfo?.barcode) {
      const existing = onlineByBarcode.get(variantInfo.barcode);
      if (existing) {
        existing.quantity += qty;
        existing.revenue += revenue;
      } else {
        onlineByBarcode.set(variantInfo.barcode, {
          quantity: qty,
          revenue,
          productTitle: variantInfo.productTitle
        });
      }
    }
  }

  // Build merged per-product rows from offline data.
  const rows: OfflineSalesPerProduct[] = [];
  let offlineTotalQuantity = 0;
  let offlineTotalSales = 0;
  let matchedRows = 0;

  // Aggregate offline rows by barcode (one offline file may have duplicate barcodes).
  const offlineByBarcode = new Map<
    string,
    { itemName: string; quantity: number; sales: number; matchedVariantId: string | null }
  >();
  const offlineWithoutBarcode: OfflineSalesPerProduct[] = [];
  const unmatched: UnmatchedOfflineRow[] = [];

  for (const row of importRecord.rows) {
    const qty = decimalToNumber(row.quantity);
    const sales = decimalToNumber(row.sales);
    offlineTotalQuantity += qty;
    offlineTotalSales += sales;

    if (row.barcode) {
      const trimmed = row.barcode.trim();
      const liveVariantId = variantIdByBarcode.get(trimmed) ?? row.matchedVariantId ?? null;
      const existing = offlineByBarcode.get(trimmed);
      if (existing) {
        existing.quantity += qty;
        existing.sales += sales;
      } else {
        offlineByBarcode.set(trimmed, {
          itemName: row.itemName,
          quantity: qty,
          sales,
          matchedVariantId: liveVariantId
        });
      }
      if (!liveVariantId) {
        unmatched.push({ itemName: row.itemName, barcode: trimmed, quantity: qty, sales });
      }
    } else {
      offlineWithoutBarcode.push({
        barcode: null,
        itemName: row.itemName,
        matchedVariantId: null,
        matchedProductTitle: null,
        productStatus: null,
        offlineQuantity: qty,
        offlineSales: sales,
        onlineQuantity: 0,
        onlineSales: 0,
        totalQuantity: qty,
        totalSales: sales,
        matched: false,
        onlinePct: 0,
        offlinePct: 100,
        inventoryQuantity: null,
        dailyBurn: 0,
        daysOfStock: null,
        stockRisk: false
      });
      unmatched.push({ itemName: row.itemName, barcode: null, quantity: qty, sales });
    }
  }

  const daysInPeriod = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const STOCK_RISK_THRESHOLD = 14;

  function buildRow(args: {
    barcode: string;
    offline?: { itemName: string; quantity: number; sales: number; matchedVariantId: string | null };
    online?: { quantity: number; revenue: number; productTitle: string };
  }): OfflineSalesPerProduct {
    const { barcode, offline, online } = args;
    const matchedVariantId = offline?.matchedVariantId ?? null;
    // Prefer the live barcode -> variant lookup we built above; fall back to the offline-side match.
    const resolvedVariantId = variantIdByBarcode.get(barcode.trim()) ?? matchedVariantId ?? null;
    const variantInfo = resolvedVariantId ? variantById.get(resolvedVariantId) ?? null : null;
    const offlineQty = offline?.quantity ?? 0;
    const offlineSales = offline?.sales ?? 0;
    const onlineQty = online?.quantity ?? 0;
    const onlineSales = online?.revenue ?? 0;
    const totalQty = offlineQty + onlineQty;
    const totalSales = offlineSales + onlineSales;
    const onlinePct = totalSales > 0 ? (onlineSales / totalSales) * 100 : 0;
    const offlinePct = totalSales > 0 ? (offlineSales / totalSales) * 100 : 0;
    const dailyBurn = totalQty / daysInPeriod;
    const inventoryQuantity = variantInfo?.inventoryQuantity ?? null;
    const productStatus = variantInfo?.productStatus ?? null;
    const isActive = productStatus !== null && productStatus.toUpperCase() === "ACTIVE";
    // Days-of-stock is only meaningful for ACTIVE products with real burn + inventory.
    const daysOfStock =
      isActive && inventoryQuantity !== null && dailyBurn > 0
        ? Math.max(0, Math.floor(inventoryQuantity / dailyBurn))
        : null;
    const stockRisk =
      isActive && daysOfStock !== null && daysOfStock <= STOCK_RISK_THRESHOLD && dailyBurn > 0;
    return {
      barcode,
      itemName: offline?.itemName ?? online?.productTitle ?? "Unknown",
      matchedVariantId: resolvedVariantId,
      matchedProductTitle: online?.productTitle ?? variantInfo?.productTitle ?? null,
      productStatus,
      offlineQuantity: offlineQty,
      offlineSales,
      onlineQuantity: onlineQty,
      onlineSales,
      totalQuantity: totalQty,
      totalSales,
      matched: Boolean(resolvedVariantId),
      onlinePct,
      offlinePct,
      inventoryQuantity,
      dailyBurn,
      daysOfStock,
      stockRisk
    };
  }

  // Merge offline-with-barcode + online-with-barcode.
  const allBarcodes = new Set<string>([
    ...Array.from(offlineByBarcode.keys()),
    ...Array.from(onlineByBarcode.keys())
  ]);

  for (const barcode of allBarcodes) {
    const offline = offlineByBarcode.get(barcode);
    const online = onlineByBarcode.get(barcode);
    const built = buildRow({ barcode, offline, online });
    if (offline && built.matched) matchedRows += 1;
    rows.push(built);
  }

  rows.push(...offlineWithoutBarcode);
  // Sort: stock-risk SKUs first (most urgent at top), then everything else by total sales desc.
  rows.sort((a, b) => {
    if (a.stockRisk && !b.stockRisk) return -1;
    if (b.stockRisk && !a.stockRisk) return 1;
    if (a.stockRisk && b.stockRisk) {
      return (a.daysOfStock ?? Infinity) - (b.daysOfStock ?? Infinity);
    }
    return b.totalSales - a.totalSales;
  });

  const unmatchedRows = importRecord.rows.length - matchedRows;

  // Heroes — bias toward rows with meaningful sales volume.
  const HERO_DOMINANCE_PCT = 80;
  const HERO_MIN_SALES = Math.max(50, offlineTotalSales * 0.005, onlineTotalSales * 0.005);
  const storeHeroes = rows
    .filter((r) => r.totalSales >= HERO_MIN_SALES && r.offlinePct >= HERO_DOMINANCE_PCT)
    .sort((a, b) => b.offlineSales - a.offlineSales)
    .slice(0, 5);
  const webHeroes = rows
    .filter((r) => r.totalSales >= HERO_MIN_SALES && r.onlinePct >= HERO_DOMINANCE_PCT)
    .sort((a, b) => b.onlineSales - a.onlineSales)
    .slice(0, 5);

  // Stock-risk count — only ACTIVE matched rows about to run out.
  const stockRiskCount = rows.filter((r) => r.stockRisk).length;

  // Sort unmatched by sales desc.
  unmatched.sort((a, b) => b.sales - a.sales);

  // ---- Affiliate halo computation -------------------------------------------------
  const offlineByBarcodeForLookup = new Map<string, { quantity: number; sales: number }>();
  for (const r of rows) {
    if (r.barcode) {
      offlineByBarcodeForLookup.set(r.barcode, { quantity: r.offlineQuantity, sales: r.offlineSales });
    }
  }

  const hasCouponColumn = importRecord.rows.some((r: any) => Boolean(r.couponCode && String(r.couponCode).trim()));
  const offlineRowsByCoupon = new Map<string, { quantity: number; sales: number; rowCount: number }>();
  if (hasCouponColumn) {
    for (const r of importRecord.rows) {
      const code = typeof r.couponCode === "string" ? r.couponCode.trim().toUpperCase() : "";
      if (!code) continue;
      const existing = offlineRowsByCoupon.get(code);
      const qty = decimalToNumber(r.quantity);
      const sales = decimalToNumber(r.sales);
      if (existing) {
        existing.quantity += qty;
        existing.sales += sales;
        existing.rowCount += 1;
      } else {
        offlineRowsByCoupon.set(code, { quantity: qty, sales, rowCount: 1 });
      }
    }
  }

  const attributions = await db.affiliateAttribution.findMany({
    where: { storeId, occurredAt: { gte: start, lt: end } },
    include: {
      affiliateMember: {
        select: { id: true, firstName: true, lastName: true, affiliateCode: true, couponCode: true }
      },
      order: {
        select: {
          id: true,
          lineItems: {
            select: {
              quantity: true,
              lineSubtotal: true,
              variantId: true,
              title: true,
              variant: {
                select: { id: true, barcode: true, product: { select: { title: true } } }
              }
            }
          }
        }
      }
    }
  });

  const memberIds = Array.from(
    new Set<string>(attributions.map((a: any) => a.affiliateMemberId).filter(Boolean))
  );
  const couponAssignments = memberIds.length
    ? await db.affiliateCouponAssignment.findMany({
        where: { storeId, affiliateMemberId: { in: memberIds } },
        select: { affiliateMemberId: true, couponCode: true }
      })
    : [];
  const couponsByMember = new Map<string, Set<string>>();
  for (const a of couponAssignments) {
    const set = couponsByMember.get(a.affiliateMemberId) ?? new Set<string>();
    if (a.couponCode) set.add(String(a.couponCode).trim().toUpperCase());
    couponsByMember.set(a.affiliateMemberId, set);
  }

  type AffiliateAccumulator = {
    affiliateMemberId: string;
    affiliateName: string;
    affiliateCode: string;
    couponCodes: Set<string>;
    onlineSales: number;
    onlineOrders: Set<string>;
    onlineQuantity: number;
    productAggregate: Map<
      string,
      { barcode: string | null; productTitle: string; onlineQuantity: number; onlineSales: number }
    >;
  };

  const affiliateAcc = new Map<string, AffiliateAccumulator>();
  for (const att of attributions) {
    const member = att.affiliateMember;
    if (!member) continue;
    let acc = affiliateAcc.get(member.id);
    if (!acc) {
      const codes = new Set<string>();
      if (member.couponCode) codes.add(String(member.couponCode).trim().toUpperCase());
      const fromAssignments = couponsByMember.get(member.id);
      if (fromAssignments) {
        for (const c of fromAssignments) codes.add(c);
      }
      acc = {
        affiliateMemberId: member.id,
        affiliateName: `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || member.affiliateCode,
        affiliateCode: member.affiliateCode,
        couponCodes: codes,
        onlineSales: 0,
        onlineOrders: new Set<string>(),
        onlineQuantity: 0,
        productAggregate: new Map()
      };
      affiliateAcc.set(member.id, acc);
    }
    acc.onlineSales += decimalToNumber(att.salesAmount);
    if (att.orderId) acc.onlineOrders.add(att.orderId);
    const lineItems = att.order?.lineItems ?? [];
    for (const li of lineItems) {
      const variant = li.variant;
      const barcode = variant?.barcode ?? null;
      const productTitle =
        variant?.product?.title ?? li.title ?? variant?.barcode ?? "Unknown";
      const key = barcode ?? `__no_barcode__${productTitle}`;
      const existing = acc.productAggregate.get(key);
      const qty = Number(li.quantity ?? 0);
      const lineRevenue = decimalToNumber(li.lineSubtotal);
      acc.onlineQuantity += qty;
      if (existing) {
        existing.onlineQuantity += qty;
        existing.onlineSales += lineRevenue;
      } else {
        acc.productAggregate.set(key, {
          barcode,
          productTitle,
          onlineQuantity: qty,
          onlineSales: lineRevenue
        });
      }
    }
  }

  const affiliateEntries: AffiliateHaloEntry[] = [];
  let totalDirectOfflineSales = 0;

  for (const acc of affiliateAcc.values()) {
    let directOfflineSales = 0;
    let directOfflineQty = 0;
    let directRowCount = 0;
    if (hasCouponColumn) {
      for (const code of acc.couponCodes) {
        const match = offlineRowsByCoupon.get(code);
        if (match) {
          directOfflineSales += match.sales;
          directOfflineQty += match.quantity;
          directRowCount += match.rowCount;
        }
      }
      totalDirectOfflineSales += directOfflineSales;
    }

    const productList = Array.from(acc.productAggregate.values())
      .sort((a, b) => b.onlineSales - a.onlineSales)
      .slice(0, 5)
      .map((p): AffiliateHaloProduct => {
        const offline = p.barcode ? offlineByBarcodeForLookup.get(p.barcode) : undefined;
        const offlineQuantity = offline?.quantity ?? 0;
        const offlineSales = offline?.sales ?? 0;
        const haloRatio = p.onlineSales > 0 ? offlineSales / p.onlineSales : 0;
        return {
          barcode: p.barcode,
          productTitle: p.productTitle,
          onlineQuantity: p.onlineQuantity,
          onlineSales: p.onlineSales,
          offlineQuantity,
          offlineSales,
          haloRatio
        };
      });

    const haloOfflineSales = productList.reduce((sum, p) => sum + p.offlineSales, 0);
    const haloOfflineQuantity = productList.reduce((sum, p) => sum + p.offlineQuantity, 0);
    const haloRatio = acc.onlineSales > 0 ? haloOfflineSales / acc.onlineSales : 0;

    affiliateEntries.push({
      affiliateMemberId: acc.affiliateMemberId,
      affiliateName: acc.affiliateName,
      affiliateCode: acc.affiliateCode,
      couponCodes: Array.from(acc.couponCodes),
      onlineSales: acc.onlineSales,
      onlineOrders: acc.onlineOrders.size,
      onlineQuantity: acc.onlineQuantity,
      haloOfflineSales,
      haloOfflineQuantity,
      directOfflineSales,
      directOfflineQuantity: directOfflineQty,
      directRowCount,
      haloRatio,
      topProducts: productList
    });
  }

  affiliateEntries.sort((a, b) => b.onlineSales - a.onlineSales);

  const storeOfflineToOnlineRatio = onlineTotalSales > 0 ? offlineTotalSales / onlineTotalSales : 0;
  const totalAffiliateOnlineSales = affiliateEntries.reduce((sum, e) => sum + e.onlineSales, 0);

  const affiliateHalo: AffiliateHaloSummary = {
    hasCouponColumn,
    storeOfflineToOnlineRatio,
    totalOnlineSales: totalAffiliateOnlineSales,
    totalDirectOfflineSales,
    affiliates: affiliateEntries
  };

  // Top products by ONLINE revenue — directly comparable to Shopify
  // Analytics' "Total sales by product" chart. Independent of the offline
  // file scope: even products that aren't in the import file appear here
  // as long as they sold on Shopify in the window. Filters: only matched
  // products (productId not null), cancelled + test orders excluded,
  // revenue = lineSubtotal − lineDiscountAmount (matches Shopify "net per
  // line" used in their per-product chart).
  const topOnlineAgg = (await db.orderLineItem.groupBy({
    by: ["productId"],
    where: {
      storeId,
      productId: { not: null },
      order: {
        storeId,
        createdAt: { gte: start, lt: end },
        cancelledAt: null,
        test: false
      }
    },
    _sum: { quantity: true, lineSubtotal: true, lineDiscountAmount: true }
  })) as any[];
  const topProductIds = topOnlineAgg
    .map((row: any) => row.productId as string)
    .filter(Boolean);
  const topProductRows = topProductIds.length
    ? ((await db.product.findMany({
        where: { id: { in: topProductIds } },
        select: { id: true, title: true }
      })) as Array<{ id: string; title: string }>)
    : [];
  const productTitleById = new Map<string, string>(
    topProductRows.map((p) => [p.id, p.title])
  );
  const topOnlineProducts = topOnlineAgg
    .map((row: any) => {
      const productId = row.productId as string;
      const units = Number(row._sum.quantity ?? 0);
      const gross = decimalToNumber(row._sum.lineSubtotal);
      const discount = decimalToNumber(row._sum.lineDiscountAmount);
      const revenue = gross - discount;
      return {
        productId,
        productTitle: productTitleById.get(productId) ?? "Unknown",
        units,
        revenue
      };
    })
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Narrative.
  const totalSales = offlineTotalSales + onlineTotalSales;
  const offlineShare = totalSales > 0 ? (offlineTotalSales / totalSales) * 100 : 0;
  const onlineShare = totalSales > 0 ? (onlineTotalSales / totalSales) * 100 : 0;
  // Top 3 at-risk SKUs (already sorted asc by daysOfStock during the rows
  // sort upstream). We pass the actual rows — not just a count — so the
  // narrative can name them and give the CEO specifics.
  const stockRiskRows = rows.filter((r) => r.stockRisk).slice(0, 3);

  const narrative = buildNarrative({
    locale,
    offlineShare,
    onlineShare,
    storeHeroes,
    webHeroes,
    stockRiskCount,
    stockRiskRows,
    stockRiskThreshold: STOCK_RISK_THRESHOLD,
    unmatchedCount: unmatched.length,
    unmatchedSales: unmatched.reduce((sum, r) => sum + r.sales, 0),
    affiliateHalo
  });

  return {
    import: mapImportRecord(importRecord),
    totals: {
      offlineQuantity: offlineTotalQuantity,
      offlineSales: offlineTotalSales,
      onlineQuantity: onlineTotalQuantity,
      onlineSales: onlineTotalSales,
      totalQuantity: offlineTotalQuantity + onlineTotalQuantity,
      totalSales,
      offlineShare,
      onlineShare
    },
    matchedRows,
    unmatchedRows,
    rows,
    storeHeroes,
    webHeroes,
    topOnlineProducts,
    unmatched,
    stockRisk: { count: stockRiskCount, threshold: STOCK_RISK_THRESHOLD },
    narrative,
    affiliateHalo
  };
}

function buildNarrative(input: {
  locale: "en" | "he";
  offlineShare: number;
  onlineShare: number;
  storeHeroes: OfflineSalesPerProduct[];
  webHeroes: OfflineSalesPerProduct[];
  stockRiskCount: number;
  // Named at-risk SKUs (top 3 by urgency). When present, the narrative
  // calls them out by product name + specific daysOfStock + revenue size,
  // instead of the generic "N SKUs projected to run out" line.
  stockRiskRows?: OfflineSalesPerProduct[];
  stockRiskThreshold: number;
  unmatchedCount: number;
  affiliateHalo?: AffiliateHaloSummary;
  unmatchedSales: number;
}): OfflineSalesNarrative {
  const {
    locale,
    offlineShare,
    onlineShare,
    storeHeroes,
    webHeroes,
    stockRiskCount,
    stockRiskRows,
    stockRiskThreshold,
    unmatchedCount
  } = input;
  const isHe = locale === "he";

  if (offlineShare === 0 && onlineShare === 0) {
    return {
      headline: isHe
        ? "אין עדיין מכירות בתקופה הזו."
        : "No sales recorded for this period yet.",
      body: isHe
        ? "ברגע שהזמנות Shopify יסונכרנו וייטען קובץ אופליין לאותו חודש, תופיע כאן התמונה המשולבת."
        : "Once Shopify orders sync and an offline file is uploaded for the same month, you'll see the combined picture here.",
      tone: "neutral"
    };
  }

  const dominant = offlineShare > onlineShare ? "offline" : onlineShare > offlineShare ? "online" : null;
  const dominantPct = Math.max(offlineShare, onlineShare).toFixed(0);
  const headline = dominant
    ? isHe
      ? `${dominantPct}% מהמכירות החודש הגיעו מ${dominant === "offline" ? "אופליין" : "אונליין"}.`
      : `${dominantPct}% of sales this period came from ${dominant === "offline" ? "offline" : "online"}.`
    : isHe
      ? `אונליין ואופליין התחלקו שווה במכירות החודש.`
      : `Online and offline split sales evenly this period.`;

  // Hebrew plural helpers — Hebrew distinguishes singular vs plural at 1
  // (and technically dual at 2, but we treat 2+ as plural). Without these
  // helpers we get "1 שורות לא נמצאו" which reads wrong.
  const heSkus = (n: number) => (n === 1 ? `מק"ט אחד` : `${n} מק"טים`);
  const heRows = (n: number) => (n === 1 ? `שורה אחת` : `${n} שורות`);
  const heDays = (n: number) => (n === 1 ? `יום אחד` : `${n} ימים`);
  const heProjectedVerb = (n: number) => (n === 1 ? `צפוי להיגמר` : `צפויים להיגמר`);
  const heFoundVerb = (n: number) => (n === 1 ? `לא נמצאה` : `לא נמצאו`);

  // Body parts ordered by urgency: action items first (stock risk, data
  // hygiene), then positive signals (heroes), then optional context
  // (affiliate halo). Each ends in a period for clean concatenation in
  // both Hebrew and English.
  const bodyParts: string[] = [];

  // CEO-grade stock-risk callout — name the products with their actual
  // daysOfStock + revenue size. Falls back to the generic count line if
  // for some reason the rows weren't passed (preserves backward compat).
  if (stockRiskCount > 0) {
    const named = (stockRiskRows ?? []).filter(
      (r) => r.daysOfStock != null && (r.matchedProductTitle || r.itemName)
    );
    if (named.length > 0) {
      // Build "RECETTE 702 (8 ימים · ₪13.3k), AUREA (10 ימים · ₪4.9k)"
      const parts = named.map((r) => {
        const title = r.matchedProductTitle ?? r.itemName;
        const days = r.daysOfStock!;
        const rev = formatMoneyish(r.totalSales);
        return isHe ? `${title} (${heDays(days)} · ₪${rev})` : `${title} (${days}d · ₪${rev})`;
      });
      const listed = parts.join(isHe ? " · " : " · ");
      const overflow = Math.max(0, stockRiskCount - named.length);
      const overflowSuffix =
        overflow > 0
          ? isHe
            ? ` ועוד ${overflow}`
            : ` and ${overflow} more`
          : "";
      bodyParts.push(
        isHe
          ? `🚩 דחוף — לבצע הזמנה השבוע: ${listed}${overflowSuffix}. בקצב הנוכחי, ההכנסה החודשית בסיכון.`
          : `🚩 Urgent — reorder this week: ${listed}${overflowSuffix}. At current burn, monthly revenue is at risk.`
      );
    } else {
      bodyParts.push(
        isHe
          ? `דחוף: ${heSkus(stockRiskCount)} ${heProjectedVerb(stockRiskCount)} תוך ${heDays(stockRiskThreshold)} בקצב המכירות המשולב — בדקו זמינות לפני הקופה הבאה.`
          : `Urgent: ${stockRiskCount} SKU${stockRiskCount === 1 ? "" : "s"} ${stockRiskCount === 1 ? "is" : "are"} projected to stock out within ${stockRiskThreshold} days at the combined burn rate — check availability before the next cycle.`
      );
    }
  }

  // Web hero — moved BEFORE store hero in body because "push ad budget" is
  // higher-leverage for a CEO than "confirm POS stock". Include the revenue
  // size so the CEO knows whether scaling the SKU is worth their attention.
  if (webHeroes[0]) {
    const r = webHeroes[0];
    const rev = formatMoneyish(r.onlineSales);
    bodyParts.push(
      isHe
        ? `🚀 הזדמנות אונליין: ${r.matchedProductTitle ?? r.itemName} עם ₪${rev} בShopify (${r.onlinePct.toFixed(0)}% מהנפח שלו) — להגדיל תקציב Meta ב20%+ השבוע.`
        : `🚀 Online opportunity: ${r.matchedProductTitle ?? r.itemName} drove ₪${rev} on Shopify (${r.onlinePct.toFixed(0)}% of its volume) — scale Meta budget +20% this week.`
    );
  }

  if (storeHeroes[0]) {
    const r = storeHeroes[0];
    const rev = formatMoneyish(r.offlineSales);
    bodyParts.push(
      isHe
        ? `🏬 חנות פיזית: ${r.matchedProductTitle ?? r.itemName} מוביל אופליין עם ₪${rev} (${r.offlinePct.toFixed(0)}% מהנפח) — לוודא מלאי לקופה הבאה.`
        : `🏬 In-store: ${r.matchedProductTitle ?? r.itemName} leads offline at ₪${rev} (${r.offlinePct.toFixed(0)}% of its volume) — confirm POS stock for next cycle.`
    );
  }

  // Data hygiene — only flag if it's material (more than 1 row or large
  // dollar value), otherwise it adds noise to a CEO report.
  if (unmatchedCount > 1 || (unmatchedCount > 0 && input.unmatchedSales > 500)) {
    bodyParts.push(
      isHe
        ? `📋 ניקיון נתונים: ${heRows(unmatchedCount)} (₪${formatMoneyish(input.unmatchedSales)}) ${heFoundVerb(unmatchedCount)} בShopify — עדכנו ברקודים לתובנות ברמת SKU.`
        : `📋 Data hygiene: ${unmatchedCount} unmatched row${unmatchedCount === 1 ? "" : "s"} (₪${formatMoneyish(input.unmatchedSales)}) — fix barcodes for per-SKU insights.`
    );
  }
  const halo = input.affiliateHalo;
  if (halo && halo.affiliates.length > 0) {
    const top = halo.affiliates[0];
    if (halo.hasCouponColumn && halo.totalDirectOfflineSales > 0) {
      bodyParts.push(
        isHe
          ? `קופוני שותפים הביאו כ${formatMoneyish(halo.totalDirectOfflineSales)} מהאופליין (ייחוס ישיר מטור הקופון).`
          : `Affiliate coupons drove ~${formatMoneyish(halo.totalDirectOfflineSales)} of offline revenue (direct-attribution from coupon column).`
      );
    } else if (top && top.haloOfflineSales > 0) {
      bodyParts.push(
        isHe
          ? `השותף המוביל ${top.affiliateName} הביא ${formatMoneyish(top.onlineSales)} אונליין; אותם מק"טים הוסיפו ${formatMoneyish(top.haloOfflineSales)} באופליין (הילה אפשרית).`
          : `Top affiliate ${top.affiliateName} drove ${formatMoneyish(top.onlineSales)} online; the same SKUs added ${formatMoneyish(top.haloOfflineSales)} offline (potential halo).`
      );
    }
  }

  return {
    headline,
    body: bodyParts.join(" "),
    tone: stockRiskCount > 0 ? "down" : "up"
  };
}

function formatMoneyish(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
}
