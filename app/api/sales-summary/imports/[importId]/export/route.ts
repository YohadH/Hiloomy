import ExcelJS from "exceljs";
import {
  getOfflineSalesSummary,
  resolveActiveStoreId,
  type OfflineSalesPerProduct
} from "@/lib/services/offline-sales-service";
import { toErrorMessage } from "@/lib/server/errors";
import { getAppLocale } from "@/lib/i18n";
import { getAuthContext } from "@/lib/auth/session";

const MONTH_LABELS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const MONTH_LABELS_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

function periodLabel(year: number, month: number, locale: "en" | "he") {
  const labels = locale === "he" ? MONTH_LABELS_HE : MONTH_LABELS_EN;
  return `${labels[month - 1] ?? month} ${year}`;
}

function safeSheetName(raw: string) {
  return raw.replace(/[\\/?*\[\]:]/g, "").slice(0, 31) || "Sheet";
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" }
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { importId } = await params;
    const [storeId, locale] = await Promise.all([resolveActiveStoreId(), getAppLocale()]);
    if (!storeId) {
      return new Response(JSON.stringify({ ok: false, error: "No store available." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    const summary = await getOfflineSalesSummary(importId, storeId, locale);
    const isHe = locale === "he";
    if (!summary) {
      return new Response(JSON.stringify({ ok: false, error: "Import not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    wb.creator = "Hiloomy";
    const currency = summary.import.currency ?? "";
    const period = periodLabel(summary.import.periodYear, summary.import.periodMonth, locale);

    const L = isHe
      ? {
          summarySheet: "סיכום",
          metric: "מדד",
          value: "ערך",
          period: "תקופה",
          sourceFile: "קובץ מקור",
          sheetTitle: "כותרת גיליון",
          currency: "מטבע",
          onlineSales: "מכירות אונליין",
          onlineUnits: "יחידות אונליין",
          onlineShare: "אחוז אונליין %",
          offlineSales: "מכירות אופליין",
          offlineUnits: "יחידות אופליין",
          offlineShare: "אחוז אופליין %",
          combinedSales: "מכירות כוללות",
          combinedUnits: "יחידות כוללות",
          rowsInFile: "שורות בקובץ",
          matched: "נמצאו (לפי ברקוד)",
          unmatched: "לא נמצאו",
          stockRisk: (t: number) => `מק"טים בסיכון מלאי (≤ ${t} ימים)`,
          agentHeadline: "כותרת הסוכן",
          agentBody: "",
          breakdownSheet: "פירוט לפי מוצר",
          col: {
            product: "מוצר",
            matchedProduct: "מוצר Shopify תואם",
            barcode: "ברקוד",
            offlineQty: "יחידות אופליין",
            offlineSales: "מכירות אופליין",
            onlineQty: "יחידות אונליין",
            onlineSales: "מכירות אונליין",
            onlinePct: "אחוז אונליין",
            offlinePct: "אחוז אופליין",
            totalQty: "סך יחידות",
            totalSales: "סך מכירות",
            inventory: "מלאי",
            burn: "שחיקה יומית",
            days: "ימי מלאי",
            matchedFlag: "תואם"
          },
          yes: "כן",
          no: "לא"
        }
      : {
          summarySheet: "Summary",
          metric: "Metric",
          value: "Value",
          period: "Period",
          sourceFile: "Source file",
          sheetTitle: "Sheet title",
          currency: "Currency",
          onlineSales: "Online sales",
          onlineUnits: "Online units",
          onlineShare: "Online share %",
          offlineSales: "Offline sales",
          offlineUnits: "Offline units",
          offlineShare: "Offline share %",
          combinedSales: "Combined sales",
          combinedUnits: "Combined units",
          rowsInFile: "Rows in file",
          matched: "Matched (by barcode)",
          unmatched: "Unmatched",
          stockRisk: (t: number) => `Stock-risk SKUs (≤ ${t} days)`,
          agentHeadline: "Agent narrative",
          agentBody: "",
          breakdownSheet: "Per-product breakdown",
          col: {
            product: "Product",
            matchedProduct: "Matched Shopify product",
            barcode: "Barcode",
            offlineQty: "Offline units",
            offlineSales: "Offline sales",
            onlineQty: "Online units",
            onlineSales: "Online sales",
            onlinePct: "Online %",
            offlinePct: "Offline %",
            totalQty: "Total units",
            totalSales: "Total sales",
            inventory: "Inventory",
            burn: "Daily burn",
            days: "Days of stock",
            matchedFlag: "Matched"
          },
          yes: "yes",
          no: "no"
        };

    // ---- Summary sheet ----
    const sumSheet = wb.addWorksheet(L.summarySheet);
    if (isHe) sumSheet.views = [{ rightToLeft: true }];
    sumSheet.columns = [
      { header: L.metric, key: "metric", width: 38 },
      { header: L.value, key: "value", width: 28 }
    ];
    styleHeader(sumSheet.getRow(1));
    sumSheet.addRows([
      { metric: L.period, value: period },
      { metric: L.sourceFile, value: summary.import.fileName },
      { metric: L.sheetTitle, value: summary.import.sheetTitle ?? "" },
      { metric: L.currency, value: currency },
      { metric: "—", value: "" },
      { metric: L.onlineSales, value: summary.totals.onlineSales },
      { metric: L.onlineUnits, value: summary.totals.onlineQuantity },
      { metric: L.onlineShare, value: Number(summary.totals.onlineShare.toFixed(2)) },
      { metric: L.offlineSales, value: summary.totals.offlineSales },
      { metric: L.offlineUnits, value: summary.totals.offlineQuantity },
      { metric: L.offlineShare, value: Number(summary.totals.offlineShare.toFixed(2)) },
      { metric: L.combinedSales, value: summary.totals.totalSales },
      { metric: L.combinedUnits, value: summary.totals.totalQuantity },
      { metric: "—", value: "" },
      { metric: L.rowsInFile, value: summary.import.totalRows },
      { metric: L.matched, value: summary.matchedRows },
      { metric: L.unmatched, value: summary.unmatchedRows },
      { metric: L.stockRisk(summary.stockRisk.threshold), value: summary.stockRisk.count },
      { metric: "—", value: "" },
      { metric: L.agentHeadline, value: summary.narrative.headline },
      { metric: "", value: summary.narrative.body }
    ]);
    sumSheet.getColumn("value").alignment = { vertical: "top", wrapText: true, horizontal: "left" };

    // ---- Per-product breakdown ----
    const detail = wb.addWorksheet(L.breakdownSheet);
    if (isHe) detail.views = [{ rightToLeft: true }];
    detail.columns = [
      { header: L.col.product, key: "itemName", width: 42 },
      { header: L.col.matchedProduct, key: "matched", width: 32 },
      { header: L.col.barcode, key: "barcode", width: 16 },
      { header: L.col.offlineQty, key: "offlineQty", width: 14 },
      { header: L.col.offlineSales, key: "offlineSales", width: 16 },
      { header: L.col.onlineQty, key: "onlineQty", width: 14 },
      { header: L.col.onlineSales, key: "onlineSales", width: 16 },
      { header: L.col.onlinePct, key: "onlinePct", width: 10 },
      { header: L.col.offlinePct, key: "offlinePct", width: 10 },
      { header: L.col.totalQty, key: "totalQty", width: 14 },
      { header: L.col.totalSales, key: "totalSales", width: 16 },
      { header: L.col.inventory, key: "inventory", width: 12 },
      { header: L.col.burn, key: "burn", width: 12 },
      { header: L.col.days, key: "days", width: 14 },
      { header: L.col.matchedFlag, key: "matchedFlag", width: 10 }
    ];
    styleHeader(detail.getRow(1));
    detail.addRows(
      summary.rows.map((r: OfflineSalesPerProduct) => ({
        itemName: r.itemName,
        matched: r.matchedProductTitle ?? "",
        barcode: r.barcode ?? "",
        offlineQty: r.offlineQuantity,
        offlineSales: r.offlineSales,
        onlineQty: r.onlineQuantity,
        onlineSales: r.onlineSales,
        onlinePct: Number(r.onlinePct.toFixed(2)),
        offlinePct: Number(r.offlinePct.toFixed(2)),
        totalQty: r.totalQuantity,
        totalSales: r.totalSales,
        inventory: r.inventoryQuantity ?? "",
        burn: Number(r.dailyBurn.toFixed(2)),
        days: r.daysOfStock ?? "",
        matchedFlag: r.matched ? L.yes : L.no
      }))
    );
    detail.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: detail.columnCount }
    };

    // ---- Heroes ----
    const heroSheetName = isHe ? "מצטיינים" : "Heroes";
    const heroes = wb.addWorksheet(heroSheetName);
    if (isHe) heroes.views = [{ rightToLeft: true }];
    heroes.columns = [
      { header: isHe ? "סוג" : "Type", key: "type", width: 14 },
      { header: isHe ? "מוצר" : "Product", key: "name", width: 42 },
      { header: isHe ? "ברקוד" : "Barcode", key: "barcode", width: 16 },
      { header: isHe ? "מכירות בערוץ" : "Channel sales", key: "sales", width: 16 },
      { header: isHe ? "אחוז ערוץ" : "Channel %", key: "pct", width: 12 },
      { header: isHe ? "סך מכירות" : "Total sales", key: "total", width: 16 }
    ];
    styleHeader(heroes.getRow(1));
    heroes.addRows([
      ...summary.storeHeroes.map((r) => ({
        type: isHe ? "גיבור חנות" : "Store hero",
        name: r.itemName,
        barcode: r.barcode ?? "",
        sales: r.offlineSales,
        pct: Number(r.offlinePct.toFixed(1)),
        total: r.totalSales
      })),
      ...summary.webHeroes.map((r) => ({
        type: isHe ? "מנצח אונליין" : "Web hero",
        name: r.itemName,
        barcode: r.barcode ?? "",
        sales: r.onlineSales,
        pct: Number(r.onlinePct.toFixed(1)),
        total: r.totalSales
      }))
    ]);

    // ---- Unmatched ----
    if (summary.unmatched.length > 0) {
      const un = wb.addWorksheet(isHe ? "שורות לא תואמות" : "Unmatched offline rows");
      if (isHe) un.views = [{ rightToLeft: true }];
      un.columns = [
        { header: isHe ? "מוצר" : "Product", key: "name", width: 42 },
        { header: isHe ? "ברקוד בקובץ" : "Barcode in file", key: "barcode", width: 18 },
        { header: isHe ? "כמות" : "Quantity", key: "quantity", width: 12 },
        { header: isHe ? "מכירות" : "Sales", key: "sales", width: 16 }
      ];
      styleHeader(un.getRow(1));
      un.addRows(
        summary.unmatched.map((r) => ({
          name: r.itemName,
          barcode: r.barcode ?? "",
          quantity: r.quantity,
          sales: r.sales
        }))
      );
    }

    // ---- Affiliate halo ----
    if (summary.affiliateHalo.affiliates.length > 0) {
      const halo = wb.addWorksheet(isHe ? "הילת שותפים" : "Affiliate halo");
      if (isHe) halo.views = [{ rightToLeft: true }];
      halo.addRow([
        summary.affiliateHalo.hasCouponColumn
          ? isHe
            ? "זוהה טור קופון — ייחוס ישיר מוצג לצד אות ההילה ברמת SKU."
            : "Coupon column detected — direct attribution shown alongside the SKU halo signal."
          : isHe
            ? "לא זוהה טור קופון — הסוכן מציג אות הילה ברמת SKU (מכירות אופליין של המוצרים שכל שותף מקדם)."
            : "No coupon column detected — the agent shows a SKU halo signal (offline sales of each affiliate's online products)."
      ]).font = { italic: true, color: { argb: "FF6B7280" } };
      halo.addRow([]);
      const headerRow = halo.addRow(
        isHe
          ? [
              "שותף",
              "קוד",
              "קודי קופון",
              "מכירות אונליין",
              "הזמנות אונליין",
              "יחידות אונליין",
              "מכירות אופליין (הילה)",
              "יחידות אופליין (הילה)",
              "מכירות אופליין ישיר",
              "יחידות אופליין ישיר",
              "יחס הילה",
              "יחס בסיס בחנות"
            ]
          : [
              "Affiliate",
              "Code",
              "Coupon codes",
              "Online sales",
              "Online orders",
              "Online units",
              "Halo offline sales",
              "Halo offline units",
              "Direct offline sales",
              "Direct offline units",
              "Halo ratio",
              "Store baseline ratio"
            ]
      );
      styleHeader(headerRow);
      const baseline = summary.affiliateHalo.storeOfflineToOnlineRatio;
      for (const a of summary.affiliateHalo.affiliates) {
        halo.addRow([
          a.affiliateName,
          a.affiliateCode,
          a.couponCodes.join(", "),
          a.onlineSales,
          a.onlineOrders,
          a.onlineQuantity,
          a.haloOfflineSales,
          a.haloOfflineQuantity,
          a.directOfflineSales,
          a.directOfflineQuantity,
          Number(a.haloRatio.toFixed(3)),
          Number(baseline.toFixed(3))
        ]);
      }
      halo.columns?.forEach((col, idx) => {
        col.width = idx === 0 ? 26 : idx === 2 ? 28 : 16;
      });

      halo.addRow([]);
      halo.addRow([]);
      halo.addRow([isHe ? "מוצרים מובילים לשותף" : "Per-affiliate top products"]).font = { bold: true };
      const productHeader = halo.addRow(
        isHe
          ? [
              "שותף",
              "מוצר",
              "ברקוד",
              "יחידות אונליין",
              "מכירות אונליין",
              "יחידות אופליין (אותו SKU)",
              "מכירות אופליין (אותו SKU)",
              "יחס הילה"
            ]
          : [
              "Affiliate",
              "Product",
              "Barcode",
              "Online units",
              "Online sales",
              "Offline units (same SKU)",
              "Offline sales (same SKU)",
              "Halo ratio"
            ]
      );
      styleHeader(productHeader);
      for (const a of summary.affiliateHalo.affiliates) {
        for (const p of a.topProducts) {
          halo.addRow([
            a.affiliateName,
            p.productTitle,
            p.barcode ?? "",
            p.onlineQuantity,
            p.onlineSales,
            p.offlineQuantity,
            p.offlineSales,
            Number(p.haloRatio.toFixed(3))
          ]);
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = safeSheetName(`sales-summary-${period.replace(/\s+/g, "-")}`);
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: toErrorMessage(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
