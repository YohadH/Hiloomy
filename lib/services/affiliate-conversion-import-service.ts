// Affiliate conversion CSV importer.
//
// Accepts the per-order export from the affiliate platform (BixGrow / similar)
// — one row per tracked order with the affiliate, customer, total, commission,
// coupon, and tracking method. Maps each row to:
//   • AffiliateMember (upsert by storeId + email)
//   • Order (lookup by orderNumber — best effort; rows without a match still
//     get attribution stored against the affiliate but without an order link)
//   • AffiliateAttribution (upsert by affiliateMemberId + orderId)
//
// Pure server-side. Returns a summary so the UI can show "X created /
// Y updated / Z skipped" feedback.
//
// CSV expected columns (header row, case-insensitive):
//   Date, Order, Affiliate name, Customer name, Customer email,
//   Affiliate email, Affiliate id, Total, Commissionable sales, Commission,
//   Coupons, Status, Tracking by, Level

import { getDb } from "@/lib/server/db";

export interface AffiliateConversionImportResult {
  totalRows: number;
  parsedRows: number;
  attributionsCreated: number;
  attributionsUpdated: number;
  membersCreated: number;
  membersUpdated: number;
  ordersMatched: number;
  ordersUnmatched: number;
  skipped: number;
  warnings: string[];
}

// Tiny RFC-4180-ish CSV parser. Handles double-quoted fields containing
// commas and escaped quotes (""). Newlines inside quoted fields supported.
// Good enough for the affiliate platform's exports — no need for a full
// dependency.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      // Skip wholly empty lines.
      if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Trailing field / row.
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
  }
  return rows;
}

interface ParsedConversionRow {
  orderNumber: string; // "#31701" → "31701" (we strip the # for matching)
  affiliateName: string;
  customerEmail: string | null;
  affiliateEmail: string | null;
  affiliateExternalId: string | null;
  total: number;
  commission: number;
  coupon: string | null;
  status: string;
  trackingBy: string | null;
  occurredAt: Date;
}

function parseNumberOrZero(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: string | undefined): Date {
  if (!value) return new Date();
  // "2026-05-01 00:38:35" — treat as UTC. Some exports use a space, some 'T'.
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function stripOrderHash(value: string): string {
  return value.replace(/^#/, "").trim();
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "Affiliate", lastName: "" };
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

// Normalised column-name lookup so we don't break when the export comes back
// with slightly different casing or stray whitespace.
function buildColumnIndex(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((col, i) => {
    map[col.trim().toLowerCase()] = i;
  });
  return map;
}

function getCol(row: string[], idx: number | undefined): string {
  if (idx === undefined) return "";
  return (row[idx] ?? "").trim();
}

export async function importAffiliateConversionsCsv(input: {
  storeId: string;
  csvText: string;
}): Promise<AffiliateConversionImportResult> {
  const db = getDb();
  const result: AffiliateConversionImportResult = {
    totalRows: 0,
    parsedRows: 0,
    attributionsCreated: 0,
    attributionsUpdated: 0,
    membersCreated: 0,
    membersUpdated: 0,
    ordersMatched: 0,
    ordersUnmatched: 0,
    skipped: 0,
    warnings: []
  };

  const rows = parseCsv(input.csvText);
  if (rows.length < 2) {
    result.warnings.push("CSV has no data rows (header only).");
    return result;
  }

  const header = rows[0];
  const idx = buildColumnIndex(header);
  const dataRows = rows.slice(1);
  result.totalRows = dataRows.length;

  const required = ["order", "affiliate name", "affiliate email", "total"];
  for (const r of required) {
    if (!(r in idx)) {
      result.warnings.push(`Missing required column "${r}".`);
      return result;
    }
  }

  // First pass — parse into typed shapes. Bail rows that lack the minimum
  // identifiers we need.
  const parsed: ParsedConversionRow[] = [];
  for (const row of dataRows) {
    const orderRaw = getCol(row, idx["order"]);
    const affEmail = getCol(row, idx["affiliate email"]).toLowerCase() || null;
    if (!orderRaw || !affEmail) {
      result.skipped += 1;
      continue;
    }
    parsed.push({
      orderNumber: stripOrderHash(orderRaw),
      affiliateName: getCol(row, idx["affiliate name"]) || "Affiliate",
      customerEmail: getCol(row, idx["customer email"]).toLowerCase() || null,
      affiliateEmail: affEmail,
      affiliateExternalId: getCol(row, idx["affiliate id"]) || null,
      total: parseNumberOrZero(getCol(row, idx["total"])),
      commission: parseNumberOrZero(getCol(row, idx["commission"])),
      coupon: getCol(row, idx["coupons"]) || null,
      status: getCol(row, idx["status"]) || "unknown",
      trackingBy: getCol(row, idx["tracking by"]) || null,
      occurredAt: parseDate(getCol(row, idx["date"]))
    });
  }
  result.parsedRows = parsed.length;

  // Pre-load the order lookup. Order numbers in our DB are stored like "#31701",
  // so we try both forms. We pull once for all referenced orders to avoid N+1.
  const orderNumbers = Array.from(new Set(parsed.map((p) => p.orderNumber)));
  const orders = orderNumbers.length
    ? await db.order.findMany({
        where: {
          storeId: input.storeId,
          OR: [
            { orderNumber: { in: orderNumbers } },
            { orderNumber: { in: orderNumbers.map((n) => `#${n}`) } }
          ]
        },
        select: { id: true, orderNumber: true }
      })
    : [];
  const orderIdByNumber = new Map<string, string>();
  for (const o of orders as any[]) {
    orderIdByNumber.set(stripOrderHash(o.orderNumber), o.id);
  }

  // Group rows by affiliate email so each member is upserted once + we batch
  // their attributions together.
  const byAffiliate = new Map<string, ParsedConversionRow[]>();
  for (const p of parsed) {
    if (!p.affiliateEmail) continue;
    const list = byAffiliate.get(p.affiliateEmail) ?? [];
    list.push(p);
    byAffiliate.set(p.affiliateEmail, list);
  }

  for (const [email, conversions] of byAffiliate.entries()) {
    const first = conversions[0];
    const { firstName, lastName } = splitName(first.affiliateName);
    // affiliateCode is `@unique` on AffiliateMember — we use the platform's
    // own affiliate id when present, otherwise hash the email.
    const code =
      first.affiliateExternalId?.trim() ||
      `${email.replace(/[^a-z0-9]/g, "")}-${first.affiliateName.slice(0, 6).replace(/\s+/g, "")}`;

    let member: { id: string } | null = await db.affiliateMember.findUnique({
      where: { storeId_email: { storeId: input.storeId, email } },
      select: { id: true }
    });
    if (!member) {
      try {
        member = await db.affiliateMember.create({
          data: {
            storeId: input.storeId,
            firstName,
            lastName,
            email,
            status: "approved",
            source: "csv_import",
            affiliateCode: code,
            couponCode: first.coupon ?? null
          },
          select: { id: true }
        });
        result.membersCreated += 1;
      } catch (e) {
        // affiliateCode collision — fall back to a uniqueness-safe suffix.
        member = await db.affiliateMember.create({
          data: {
            storeId: input.storeId,
            firstName,
            lastName,
            email,
            status: "approved",
            source: "csv_import",
            affiliateCode: `${code}-${Date.now()}`,
            couponCode: first.coupon ?? null
          },
          select: { id: true }
        });
        result.membersCreated += 1;
      }
    } else {
      // Member existed — keep their state but make sure couponCode reflects
      // the most-recent coupon we've seen for them.
      if (first.coupon) {
        await db.affiliateMember.update({
          where: { id: member.id },
          data: { couponCode: first.coupon }
        });
      }
      result.membersUpdated += 1;
    }

    // By this point every path above has assigned `member`, but TypeScript
    // cannot narrow the reassigned `let` across the if/else, so confirm it.
    if (!member) continue;
    const memberId = member.id;

    for (const c of conversions) {
      const orderId = orderIdByNumber.get(c.orderNumber) ?? null;
      if (orderId) result.ordersMatched += 1;
      else result.ordersUnmatched += 1;

      // AffiliateAttribution.@@unique([affiliateMemberId, orderId]) — but
      // orderId can be null. For unmatched-order rows we still want to store
      // the attribution; we just can't dedupe by order. Skip those if the
      // same conversion has been imported before (best-effort: match on date
      // + amount + member).
      if (!orderId) {
        const dup = await db.affiliateAttribution.findFirst({
          where: {
            storeId: input.storeId,
            affiliateMemberId: memberId,
            orderId: null,
            occurredAt: c.occurredAt,
            salesAmount: c.total
          },
          select: { id: true }
        });
        if (dup) {
          result.attributionsUpdated += 1;
          continue;
        }
        await db.affiliateAttribution.create({
          data: {
            storeId: input.storeId,
            affiliateMemberId: memberId,
            orderId: null,
            sourceType: c.coupon ? "coupon" : "link",
            trackingMethod: c.trackingBy ?? null,
            salesAmount: c.total,
            commissionAmount: c.commission,
            ordersCount: 1,
            occurredAt: c.occurredAt
          }
        });
        result.attributionsCreated += 1;
        continue;
      }

      const existing = await db.affiliateAttribution.findUnique({
        where: {
          affiliateMemberId_orderId: {
            affiliateMemberId: memberId,
            orderId
          }
        },
        select: { id: true }
      });
      if (existing) {
        await db.affiliateAttribution.update({
          where: { id: existing.id },
          data: {
            sourceType: c.coupon ? "coupon" : "link",
            trackingMethod: c.trackingBy ?? null,
            salesAmount: c.total,
            commissionAmount: c.commission,
            occurredAt: c.occurredAt
          }
        });
        result.attributionsUpdated += 1;
      } else {
        await db.affiliateAttribution.create({
          data: {
            storeId: input.storeId,
            affiliateMemberId: memberId,
            orderId,
            sourceType: c.coupon ? "coupon" : "link",
            trackingMethod: c.trackingBy ?? null,
            salesAmount: c.total,
            commissionAmount: c.commission,
            ordersCount: 1,
            occurredAt: c.occurredAt
          }
        });
        result.attributionsCreated += 1;
      }
    }
  }

  return result;
}
