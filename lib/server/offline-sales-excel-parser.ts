import * as XLSX from "xlsx";

export type ParsedOfflineSalesRow = {
  itemName: string;
  barcode: string | null;
  couponCode: string | null;
  quantity: number;
  sales: number;
};

export type ParsedOfflineSalesSheet = {
  sheetTitle: string | null;
  detectedYear: number | null;
  detectedMonth: number | null;
  rows: ParsedOfflineSalesRow[];
};

const HEBREW_MONTHS: Record<string, number> = {
  "ינואר": 1,
  "פברואר": 2,
  "מרץ": 3,
  "מרס": 3,
  "אפריל": 4,
  "מאי": 5,
  "יוני": 6,
  "יולי": 7,
  "אוגוסט": 8,
  "ספטמבר": 9,
  "אוקטובר": 10,
  "נובמבר": 11,
  "דצמבר": 12
};

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12
};

const NAME_HEADER_KEYS = ["itemname", "item name", "name", "שם", "שם פריט", "מוצר"];
const BARCODE_HEADER_KEYS = ["itembarcode", "item barcode", "barcode", "ברקוד", "מק\"ט", "מקט", "sku"];
const QUANTITY_HEADER_KEYS = ["quantity", "qty", "כמות", "סכום של quantity"];
const SALES_HEADER_KEYS = ["sales", "amount", "total", "סכום", "סכום של sales", "מכירות"];
const COUPON_HEADER_KEYS = [
  "coupon",
  "coupon code",
  "couponcode",
  "discount",
  "discount code",
  "discountcode",
  "promo",
  "promo code",
  "promocode",
  "code",
  "קופון",
  "קוד קופון",
  "קוד הנחה",
  "הנחה",
  "קוד"
];

function normaliseCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function lower(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchHeader(cell: string, keys: string[]): boolean {
  const normalised = lower(cell);
  if (!normalised) return false;
  return keys.some((key) => normalised === key || normalised.includes(key));
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "").replace(/[^\d.\-]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function detectPeriod(text: string): { year: number | null; month: number | null } {
  const lowered = text.toLowerCase();

  let month: number | null = null;
  for (const [name, num] of Object.entries(HEBREW_MONTHS)) {
    if (text.includes(name)) {
      month = num;
      break;
    }
  }
  if (month === null) {
    for (const [name, num] of Object.entries(ENGLISH_MONTHS)) {
      const re = new RegExp(`\\b${name}\\b`);
      if (re.test(lowered)) {
        month = num;
        break;
      }
    }
  }

  let year: number | null = null;
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch) year = Number(yearMatch[1]);

  return { year, month };
}

export function parseOfflineSalesWorkbook(buffer: Buffer | ArrayBuffer): ParsedOfflineSalesSheet {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Workbook has no sheets");
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null
  });

  // Find the header row by scanning first 10 rows for one that has at least
  // a name and a sales/quantity column.
  let headerRowIdx = -1;
  let nameCol = -1;
  let barcodeCol = -1;
  let qtyCol = -1;
  let salesCol = -1;
  let couponCol = -1;

  for (let r = 0; r < Math.min(rows.length, 10); r += 1) {
    const row = rows[r] ?? [];
    let localName = -1;
    let localBarcode = -1;
    let localQty = -1;
    let localSales = -1;
    let localCoupon = -1;
    for (let c = 0; c < row.length; c += 1) {
      const cell = normaliseCell(row[c]);
      if (!cell) continue;
      if (localName === -1 && matchHeader(cell, NAME_HEADER_KEYS)) localName = c;
      else if (localBarcode === -1 && matchHeader(cell, BARCODE_HEADER_KEYS)) localBarcode = c;
      else if (localQty === -1 && matchHeader(cell, QUANTITY_HEADER_KEYS)) localQty = c;
      else if (localSales === -1 && matchHeader(cell, SALES_HEADER_KEYS)) localSales = c;
      else if (localCoupon === -1 && matchHeader(cell, COUPON_HEADER_KEYS)) localCoupon = c;
    }
    const score =
      (localName !== -1 ? 1 : 0) +
      (localBarcode !== -1 ? 1 : 0) +
      (localQty !== -1 ? 1 : 0) +
      (localSales !== -1 ? 1 : 0);
    if (score >= 2 && localName !== -1) {
      headerRowIdx = r;
      nameCol = localName;
      barcodeCol = localBarcode;
      qtyCol = localQty;
      salesCol = localSales;
      couponCol = localCoupon;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      "Could not find a header row. Expected columns like ItemName, ItemBarcode, Quantity, Sales (or Hebrew equivalents)."
    );
  }

  // Sheet title: first non-empty cell anywhere above the header row.
  let sheetTitle: string | null = null;
  for (let r = 0; r < headerRowIdx; r += 1) {
    const row = rows[r] ?? [];
    for (const cell of row) {
      const value = normaliseCell(cell);
      if (value) {
        sheetTitle = value;
        break;
      }
    }
    if (sheetTitle) break;
  }

  // If no title row exists, try sheet name.
  if (!sheetTitle) sheetTitle = firstSheetName;

  // Period auto-detection from title + sheet name.
  const haystack = `${sheetTitle ?? ""} ${firstSheetName}`;
  const { year, month } = detectPeriod(haystack);

  const parsedRows: ParsedOfflineSalesRow[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const itemName = normaliseCell(row[nameCol]);
    const rawBarcode = barcodeCol !== -1 ? normaliseCell(row[barcodeCol]) : "";
    const rawCoupon = couponCol !== -1 ? normaliseCell(row[couponCol]) : "";
    const quantity = qtyCol !== -1 ? toNumber(row[qtyCol]) : 0;
    const sales = salesCol !== -1 ? toNumber(row[salesCol]) : 0;
    if (!itemName && !rawBarcode && quantity === 0 && sales === 0) continue;
    if (!itemName) continue;
    parsedRows.push({
      itemName,
      barcode: rawBarcode || null,
      couponCode: rawCoupon || null,
      quantity,
      sales
    });
  }

  return {
    sheetTitle,
    detectedYear: year,
    detectedMonth: month,
    rows: parsedRows
  };
}
