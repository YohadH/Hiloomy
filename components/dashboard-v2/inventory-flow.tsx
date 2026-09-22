"use client";

// Inventory flow by location — the presentational pieces of the movement
// view on Product follow-ups (owner, 18 Sep 2026):
//   • FlowSummaryCards   opening · new stock received · net sold · now,
//                        with redistributed / in transit / unclassified as footnotes
//   • LocationChips      compact per-location indicator on the product row
//   • ProductFlow        the ledger per location, the BUSINESS TOTAL row
//                        (transfers cancel, in transit kept), then by variant
//   • PoReceiptForm      record a purchase-order receipt (external stock)
// Wording rules: "external receipt" ≠ "transferred in"; a probable transfer
// is marked ≈ with its confidence; an unexplained change is "unclassified",
// never "adjustment"; a netted sale is "net sold".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type React from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, Info, PackageCheck, PackagePlus, ShoppingBag } from "lucide-react";
import type { BusinessLedger, LocationLedger, VariantLedger } from "@/lib/domain/inventory-movement";
import type { InventoryMovementReport, ProductMovement } from "@/lib/services/inventory-movement-service";
import type { ProductStockRow } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { cn, formatNumber } from "@/lib/utils";

const n = (v: number | null) => (v === null ? "—" : formatNumber(v));
const plus = (v: number) => (v === 0 ? "0" : `+${formatNumber(v)}`);
const minus = (v: number) => (v === 0 ? "0" : `−${formatNumber(v)}`);
const signed = (v: number | null) => (v === null ? "—" : v === 0 ? "0" : v > 0 ? `+${formatNumber(v)}` : `−${formatNumber(Math.abs(v))}`);

// ── Summary cards ─────────────────────────────────────────────────────────

export function FlowSummaryCards({ report, locale, locationFilter }: { report: InventoryMovementReport; locale: AppLocale; locationFilter: string }) {
  const he = locale === "he";
  const loc = locationFilter ? report.summary.locations.find((l) => l.locationId === locationFilter) ?? null : null;
  const total = report.summary.total;
  const opening = loc ? loc.opening : total.opening;
  const inbound = loc ? loc.receivedExternal + loc.receivedUnclassified + loc.transferIn + loc.probableTransferIn : total.receivedExternal + total.receivedUnclassified;
  const sold = loc ? loc.sold : total.sold;
  const closing = loc ? loc.closing : total.onHand;
  const closingLabel = report.closingLive ? (he ? "מלאי עכשיו" : "Stock now") : he ? `מלאי בסוף התקופה (${report.closingDate ?? "—"})` : `Closing stock (${report.closingDate ?? "—"})`;
  const inboundHint = loc
    ? he
      ? `מתוכם ${formatNumber(loc.receivedExternal + loc.receivedUnclassified)} קליטה חיצונית · ${formatNumber(loc.transferIn + loc.probableTransferIn)} העברה פנימית${loc.probableTransferIn ? " (≈)" : ""}`
      : `${formatNumber(loc.receivedExternal + loc.receivedUnclassified)} external · ${formatNumber(loc.transferIn + loc.probableTransferIn)} internal transfer${loc.probableTransferIn ? " (≈)" : ""}`
    : total.receivedUnclassified > 0
      ? he
        ? `${formatNumber(total.receivedExternal)} קבלות PO · ${formatNumber(total.receivedUnclassified)} ממקור לא מזוהה`
        : `${formatNumber(total.receivedExternal)} PO receipts · ${formatNumber(total.receivedUnclassified)} from an unidentified source`
      : he
        ? "קבלות PO — העברות פנימיות לא נספרות"
        : "PO receipts — internal transfers not counted";
  const soldHint = (() => {
    const gross = loc ? loc.soldGross : total.soldGross;
    const returns = loc ? loc.returns : total.returns;
    const parts = [returns > 0 ? (he ? `ברוטו ${formatNumber(gross)} · החזרות ${formatNumber(returns)}` : `gross ${formatNumber(gross)} · returns ${formatNumber(returns)}`) : he ? "לפי תאריך ההזמנה" : "by order date", !loc && total.unlocatedSold > 0 ? (he ? `כולל ${formatNumber(total.unlocatedSold)} ללא מיקום` : `incl. ${formatNumber(total.unlocatedSold)} unlocated`) : null];
    return parts.filter(Boolean).join(" · ");
  })();
  const cards: Array<{ icon: typeof Boxes; label: string; value: string; hint: string; cls: string }> = [
    { icon: Boxes, label: he ? "מלאי פתיחה" : "Opening stock", value: n(opening), hint: report.openingDate ? (he ? `תמונת מלאי ${report.openingDate}` : `snapshot ${report.openingDate}`) : he ? "אין תמונת מלאי לפני התקופה" : "no snapshot before the period", cls: "bg-slate-500/10 text-slate-700" },
    { icon: PackagePlus, label: loc ? (he ? "נכנס למיקום" : "Into this location") : he ? "מלאי חדש שהתקבל" : "New stock received", value: plus(inbound), hint: inboundHint, cls: "bg-emerald-500/10 text-emerald-700" },
    { icon: ShoppingBag, label: he ? "נמכר (נטו)" : "Net units sold", value: minus(sold), hint: soldHint, cls: "bg-rose-500/10 text-rose-700" },
    { icon: PackageCheck, label: closingLabel, value: n(closing), hint: !loc && total.inTransit > 0 ? (he ? `פיזי ${formatNumber(total.onHand)} + בדרך ${formatNumber(total.inTransit)} = ${formatNumber(total.inventory)}` : `physical ${formatNumber(total.onHand)} + in transit ${formatNumber(total.inTransit)} = ${formatNumber(total.inventory)}`) : `${report.range.start} → ${report.range.end}`, cls: "bg-sky-500/10 text-sky-700" }
  ];
  return (
    <section className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <span className={cn("rounded-md p-1.5", c.cls)}>
                <c.icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
            <p className="text-[11px] text-muted-foreground">{c.hint}</p>
          </div>
        ))}
      </div>
      <Footnotes report={report} locale={locale} loc={loc} />
    </section>
  );
}

function Footnotes({ report, locale, loc }: { report: InventoryMovementReport; locale: AppLocale; loc: LocationLedger | null }) {
  const he = locale === "he";
  const t = report.summary.total;
  const lines: Array<{ text: string; tone?: "warn" }> = [];
  if (!loc && t.redistributed > 0) lines.push({ text: he ? `${formatNumber(t.redistributed)} יחידות חולקו בין מיקומים במהלך התקופה (פנימי — לא מלאי חדש).` : `${formatNumber(t.redistributed)} units redistributed between locations during the period (internal — not new stock).` });
  if (!loc && t.inTransit > 0) lines.push({ text: he ? `${formatNumber(t.inTransit)} יחידות בדרך בין מיקומים — נספרות במלאי העסק, לא על מדף.` : `${formatNumber(t.inTransit)} units in transit between locations — counted in business inventory, on no shelf.` });
  if (!loc && t.probableTransfers.length) lines.push({ text: he ? `נראות העברות פנימיות של כ-${formatNumber(t.probableRedistributed)} יחידות שלא נרשמו: ${t.probableTransfers.slice(0, 3).map((p) => `${p.fromLocationName} → ${p.toLocationName} ≈${formatNumber(p.quantity)} (${p.confidence === "medium" ? "ביטחון בינוני" : "ביטחון נמוך"})`).join(" · ")}.` : `Probable internal transfers of ~${formatNumber(t.probableRedistributed)} units without a record: ${t.probableTransfers.slice(0, 3).map((p) => `${p.fromLocationName} → ${p.toLocationName} ≈${formatNumber(p.quantity)} (${p.confidence} confidence)`).join(" · ")}.` });
  if (!loc && t.receivedUnclassified > 0) lines.push({ text: he ? `${formatNumber(t.receivedUnclassified)} יחידות נוספו למלאי ממקור לא מזוהה (PO שלא נרשם, התאמת ERP…).` : `${formatNumber(t.receivedUnclassified)} units were added to stock from an unidentified source (an unrecorded PO, an ERP adjustment…).`, tone: "warn" });
  if (!loc && t.unclassifiedDecrease > 0) lines.push({ text: he ? `${formatNumber(t.unclassifiedDecrease)} יחידות ירדו מהמלאי בלי אירוע מסביר (בלאי, תיקון שלא נרשם, החזרה שלא הוחזרה למדף).` : `${formatNumber(t.unclassifiedDecrease)} units left stock with no explaining event (shrink, an unrecorded correction, an unrestocked return).`, tone: "warn" });
  if (t.reconciliationGap !== null && t.reconciliationGap !== 0) lines.push({ text: he ? `פער התאמה ${signed(t.reconciliationGap)} — הספר לא נסגר; לבדוק בביקורת.` : `Reconciliation gap ${signed(t.reconciliationGap)} — the ledger does not close; check the audit.`, tone: "warn" });
  lines.push({ text: report.historyStart ? (he ? `היסטוריית מלאי זמינה מ-${report.historyStart}.` : `Inventory history available since ${report.historyStart}.`) : he ? "היסטוריית מלאי תתחיל להיאסף מהסנכרון הבא." : "Inventory history starts with the next sync." });
  const cov = report.evidence.transferCoverageSince;
  if (report.evidence.transfers.state === "ok" && cov) lines.push({ text: he ? `היסטוריית העברות מדויקת זמינה מ-${cov}.${report.evidence.transferCoverageGap ? " התקופה מתחילה לפני כן — העברות מוקדמות יותר מופיעות כתנועה נגזרת." : ""}` : `Exact transfer history available since ${cov}.${report.evidence.transferCoverageGap ? " The period starts earlier — earlier transfers appear as derived movement." : ""}`, tone: report.evidence.transferCoverageGap ? "warn" : undefined });
  else if (report.evidence.transfers.state === "scope") lines.push({ text: he ? "העברות Shopify לא זמינות — נדרשת הרשאת read_inventory_transfers (לחבר מחדש את Shopify); עד אז העברות מופיעות כתנועה נגזרת." : "Shopify transfers unavailable — the read_inventory_transfers scope is missing (reconnect Shopify); until then transfers appear as derived movement.", tone: "warn" });
  else if (report.evidence.transfers.state !== "ok") lines.push({ text: he ? "העברות Shopify טרם סונכרנו — העברות מופיעות כתנועה נגזרת." : "Shopify transfers not synced yet — transfers appear as derived movement.", tone: "warn" });
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {lines.map((l, i) => (
        <li key={i} className={cn("flex items-start gap-1.5", l.tone === "warn" && "text-amber-700")}>
          {i === 0 && !loc && report.summary.total.redistributed > 0 ? <ArrowLeftRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> : <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current" />}
          <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Location chips on the product row ────────────────────────────────────

export function LocationChips({ pm, locale, onOpen, open }: { pm: ProductMovement; locale: AppLocale; onOpen: () => void; open: boolean }) {
  const he = locale === "he";
  const locs = pm.locations.filter((l) => l.closing !== 0 || l.sold > 0 || l.receivedExternal > 0 || l.transferIn > 0 || l.receivedUnclassified > 0).slice(0, 4);
  return (
    <button type="button" onClick={onOpen} aria-expanded={open} className="flex flex-wrap gap-1 text-start">
      {locs.length ? (
        locs.map((l) => (
          <span key={l.locationId} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] tabular-nums">
            <span className="max-w-[8rem] truncate">{l.locationName}</span>
            <span className={cn("font-semibold", l.closing <= 0 && "text-rose-700")}>{formatNumber(l.closing)}</span>
          </span>
        ))
      ) : (
        <span className="text-[11px] text-muted-foreground">{he ? "0 בכל המיקומים" : "0 everywhere"}</span>
      )}
      {pm.locations.length > locs.length ? <span className="text-[11px] text-muted-foreground">+{pm.locations.length - locs.length}</span> : null}
    </button>
  );
}

// ── The ledger ─────────────────────────────────────────────────────────────
// Exception first (owner, 22 Sep 2026): the eye should land on what moved.
//   • column order (RTL): location · now · sold · in · transfers · adjustments · start
//   • "now" is the anchor column — bold, right next to the name
//   • sold is a plain positive count ("20"), never "−20"
//   • 0 renders as a faint "—"; colour only on exceptions (inbound green,
//     negative adjustment / unclassified amber, gap rose)
//   • locations with no activity collapse under "show N idle locations"
//   • a one-line summary above the table; the audit text behind "how is this
//     computed?"

const dash = <span className="text-muted-foreground/50">—</span>;
const zeroOr = (v: number, render: () => React.ReactNode) => (v === 0 ? dash : render());

type Activity = { sold: number; inbound: number; transfers: number; adjustments: number; flagged: boolean };

function activityOf(m: LocationLedger): Activity {
  const inbound = m.receivedExternal + m.receivedUnclassified;
  const transfers = m.transferIn + m.probableTransferIn + m.transferOut + m.probableTransferOut;
  const adjustments = Math.abs(m.adjustments) + m.unclassifiedDecrease;
  return { sold: m.sold, inbound, transfers, adjustments, flagged: m.receivedUnclassified > 0 || m.unclassifiedDecrease > 0 || m.probableTransferIn + m.probableTransferOut > 0 };
}

const isIdle = (m: LocationLedger) => {
  const a = activityOf(m);
  return a.sold === 0 && a.inbound === 0 && a.transfers === 0 && a.adjustments === 0 && m.returns === 0;
};

function LedgerHead({ report, locale }: { report: InventoryMovementReport; locale: AppLocale }) {
  const he = locale === "he";
  const now = report.closingLive ? (he ? "עכשיו" : "Now") : he ? `סגירה ${report.closingDate ?? ""}` : `Closing ${report.closingDate ?? ""}`;
  const th = "py-1.5 pe-3 text-end font-semibold";
  return (
    <tr>
      <th className="py-1.5 pe-3 text-start font-semibold">{he ? "מיקום" : "Location"}</th>
      <th className={cn(th, "text-foreground")}>{now}</th>
      <th className={th}>{he ? "נמכר" : "Sold"}</th>
      <th className={th} title={he ? "קליטה חיצונית: קבלות PO (מדויק) + מקור לא מזוהה (?)" : "External receipts: PO receipts (exact) + unidentified source (?)"}>
        {he ? "נכנס" : "In"}
      </th>
      <th className={th} title={he ? "העברות פנימיות: נכנס פחות יצא. ≈ = העברה סבירה שלא נרשמה" : "Internal transfers: in minus out. ≈ = probable, unrecorded"}>
        {he ? "העברות" : "Transfers"}
      </th>
      <th className={th}>{he ? "התאמות" : "Adjustments"}</th>
      <th className={cn(th, "pe-0")} title={report.openingDate ? (he ? `תמונת מלאי ${report.openingDate}` : `snapshot ${report.openingDate}`) : undefined}>
        {he ? "בתחילת התקופה" : "At start"}
      </th>
    </tr>
  );
}

function LedgerRow({ m, locale }: { m: LocationLedger; locale: AppLocale }) {
  const he = locale === "he";
  const a = activityOf(m);
  const netTransfer = m.transferIn + m.probableTransferIn - m.transferOut - m.probableTransferOut;
  const probable = m.probableTransferIn + m.probableTransferOut > 0;
  const adjTotal = m.adjustments - m.unclassifiedDecrease;
  const inboundTitle = m.receivedUnclassified > 0 ? (he ? `${formatNumber(m.receivedExternal)} קבלות PO · ${formatNumber(m.receivedUnclassified)} ממקור לא מזוהה (נגזר)` : `${formatNumber(m.receivedExternal)} PO receipts · ${formatNumber(m.receivedUnclassified)} from an unidentified source (derived)`) : he ? "קבלות PO מדויקות" : "exact PO receipts";
  const soldTitle = he ? `ברוטו ${formatNumber(m.soldGross)} · החזרות ${formatNumber(m.returns)} · ${formatNumber(m.soldPos)} בקופה · ${formatNumber(m.soldFulfilled)} אונליין שסופקו מכאן` : `gross ${formatNumber(m.soldGross)} · returns ${formatNumber(m.returns)} · ${formatNumber(m.soldPos)} at the till · ${formatNumber(m.soldFulfilled)} online fulfilled from here`;
  const transferTitle = he ? `נכנס ${formatNumber(m.transferIn)}${m.probableTransferIn ? ` (+${formatNumber(m.probableTransferIn)} ≈)` : ""} · יצא ${formatNumber(m.transferOut)}${m.probableTransferOut ? ` (+${formatNumber(m.probableTransferOut)} ≈)` : ""}` : `in ${formatNumber(m.transferIn)}${m.probableTransferIn ? ` (+${formatNumber(m.probableTransferIn)} ≈)` : ""} · out ${formatNumber(m.transferOut)}${m.probableTransferOut ? ` (+${formatNumber(m.probableTransferOut)} ≈)` : ""}`;
  const adjTitle = he ? `${signed(m.adjustments)} התאמות מדויקות · ${m.unclassifiedDecrease ? `−${formatNumber(m.unclassifiedDecrease)} ירידה לא מסווגת (נגזר)` : "אין ירידה לא מסווגת"}` : `${signed(m.adjustments)} exact adjustments · ${m.unclassifiedDecrease ? `−${formatNumber(m.unclassifiedDecrease)} unclassified decrease (derived)` : "no unclassified decrease"}`;
  const td = "py-1.5 pe-3 text-end tabular-nums";
  return (
    <tr className={cn(a.flagged && "bg-amber-50/40")}>
      <td className="py-1.5 pe-3 font-medium">
        {a.flagged ? <span className="me-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" title={he ? "יש כאן תנועה שלא הוסברה במלואה" : "Movement here is not fully explained"} /> : null}
        {m.locationName}
      </td>
      <td className={cn(td, "font-semibold", m.closing < 0 && "text-rose-700")}>{formatNumber(m.closing)}</td>
      <td className={td} title={soldTitle}>
        {zeroOr(m.sold, () => (
          <>
            {formatNumber(m.sold)}
            {m.returns > 0 ? <span className="ms-1 text-[10px] text-muted-foreground">({formatNumber(m.returns)} {he ? "הוחזרו" : "returned"})</span> : null}
          </>
        ))}
      </td>
      <td className={cn(td, m.receivedUnclassified > 0 ? "text-amber-700" : "text-emerald-700")} title={inboundTitle}>
        {zeroOr(a.inbound, () => (
          <>
            +{formatNumber(a.inbound)}
            {m.receivedUnclassified > 0 ? <span className="ms-0.5 text-[10px]">?</span> : null}
          </>
        ))}
      </td>
      <td className={cn(td, probable ? "text-amber-700" : "text-sky-700")} title={transferTitle}>
        {zeroOr(a.transfers, () => (
          <>
            {netTransfer === 0 ? `±${formatNumber(m.transferIn + m.probableTransferIn)}` : signed(netTransfer)}
            {probable ? <span className="ms-0.5 text-[10px]">≈</span> : null}
          </>
        ))}
      </td>
      <td className={cn(td, adjTotal < 0 && "text-amber-700", adjTotal > 0 && "text-emerald-700")} title={adjTitle}>
        {zeroOr(a.adjustments, () => (
          <>
            {signed(adjTotal)}
            {m.unclassifiedDecrease > 0 ? <span className="ms-1 text-[10px]">{he ? "לא מסווג" : "unclassified"}</span> : null}
          </>
        ))}
      </td>
      <td className={cn(td, "pe-0 text-muted-foreground")}>{n(m.opening)}</td>
    </tr>
  );
}

function BusinessRow({ t, locale }: { t: BusinessLedger; locale: AppLocale }) {
  const he = locale === "he";
  const inbound = t.receivedExternal + t.receivedUnclassified;
  const adjTotal = t.adjustments - t.unclassifiedDecrease;
  const td = "py-2 pe-3 text-end tabular-nums";
  return (
    <tr className="border-t-2 border-border bg-muted/40 font-semibold">
      <td className="py-2 pe-3">{he ? "סה״כ עסק" : "Business total"}</td>
      <td className={td} title={t.inTransit > 0 ? (he ? `פיזי ${formatNumber(t.onHand)} + בדרך ${formatNumber(t.inTransit)} = ${formatNumber(t.inventory)}` : `on hand ${formatNumber(t.onHand)} + in transit ${formatNumber(t.inTransit)} = ${formatNumber(t.inventory)}`) : undefined}>
        {formatNumber(t.onHand)}
        {t.inTransit > 0 ? <span className="ms-1 text-[10px] font-normal text-muted-foreground">+{formatNumber(t.inTransit)} {he ? "בדרך" : "in transit"}</span> : null}
      </td>
      <td className={td} title={he ? `ברוטו ${formatNumber(t.soldGross)} · החזרות ${formatNumber(t.returns)}` : `gross ${formatNumber(t.soldGross)} · returns ${formatNumber(t.returns)}`}>
        {zeroOr(t.sold, () => (
          <>
            {formatNumber(t.sold)}
            {t.unlocatedSold > 0 ? <span className="ms-1 text-[10px] font-normal text-muted-foreground">({formatNumber(t.unlocatedSold)} {he ? "ללא מיקום" : "unlocated"})</span> : null}
          </>
        ))}
      </td>
      <td className={cn(td, t.receivedUnclassified > 0 ? "text-amber-700" : "text-emerald-700")} title={he ? `${formatNumber(t.receivedExternal)} קבלות PO · ${formatNumber(t.receivedUnclassified)} ממקור לא מזוהה` : `${formatNumber(t.receivedExternal)} PO receipts · ${formatNumber(t.receivedUnclassified)} unidentified`}>
        {zeroOr(inbound, () => (
          <>
            +{formatNumber(inbound)}
            {t.receivedUnclassified > 0 ? <span className="ms-0.5 text-[10px]">?</span> : null}
          </>
        ))}
      </td>
      <td className={cn(td, "font-normal text-muted-foreground")} title={he ? `${formatNumber(t.redistributed)} יחידות חולקו בין מיקומים — מתאפס ברמת העסק` : `${formatNumber(t.redistributed)} units moved between locations — cancels at business level`}>
        {t.redistributed + t.probableRedistributed > 0 ? `↔ ${formatNumber(t.redistributed + t.probableRedistributed)}` : dash}
      </td>
      <td className={cn(td, adjTotal < 0 && "text-amber-700")}>{t.opening === null && t.adjustments === 0 ? dash : zeroOr(Math.abs(adjTotal), () => signed(adjTotal))}</td>
      <td className={cn(td, "pe-0 text-muted-foreground")}>{n(t.opening)}</td>
    </tr>
  );
}

export function LedgerTable({ locations, total, report, locale, filterLocation }: { locations: LocationLedger[]; total: BusinessLedger; report: InventoryMovementReport; locale: AppLocale; filterLocation?: string }) {
  const he = locale === "he";
  const [showIdle, setShowIdle] = useState(false);
  const scoped = filterLocation ? locations.filter((l) => l.locationId === filterLocation) : locations;
  const active = scoped.filter((l) => !isIdle(l));
  const idle = scoped.filter(isIdle);
  // Flagged rows first, then by units moved, so the exception is on top.
  const rows = [...active].sort((x, y) => {
    const ax = activityOf(x);
    const ay = activityOf(y);
    if (ax.flagged !== ay.flagged) return ax.flagged ? -1 : 1;
    return ay.sold + ay.inbound + ay.transfers + ay.adjustments - (ax.sold + ax.inbound + ax.transfers + ax.adjustments);
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
          <LedgerHead report={report} locale={locale} />
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((m) => (
            <LedgerRow key={m.locationId} m={m} locale={locale} />
          ))}
          {showIdle
            ? idle.map((m) => (
                <tr key={m.locationId} className="text-muted-foreground/70">
                  <td className="py-1.5 pe-3">{m.locationName}</td>
                  <td className="py-1.5 pe-3 text-end tabular-nums">{formatNumber(m.closing)}</td>
                  <td className="py-1.5 pe-3 text-end">{dash}</td>
                  <td className="py-1.5 pe-3 text-end">{dash}</td>
                  <td className="py-1.5 pe-3 text-end">{dash}</td>
                  <td className="py-1.5 pe-3 text-end">{dash}</td>
                  <td className="py-1.5 text-end tabular-nums">{n(m.opening)}</td>
                </tr>
              ))
            : null}
          {!active.length && !showIdle ? (
            <tr>
              <td colSpan={7} className="py-2 text-center text-muted-foreground">
                {he ? "לא הייתה תנועה בתקופה הזאת." : "No movement in this period."}
              </td>
            </tr>
          ) : null}
          {!filterLocation ? <BusinessRow t={total} locale={locale} /> : null}
        </tbody>
      </table>
      {idle.length ? (
        <button type="button" onClick={() => setShowIdle((v) => !v)} className="mt-1 text-[11px] text-muted-foreground underline-offset-4 hover:underline">
          {showIdle ? (he ? "▾ הסתר מיקומים ללא פעילות" : "▾ Hide idle locations") : he ? `▸ הצג ${formatNumber(idle.length)} מיקומים ללא פעילות` : `▸ Show ${formatNumber(idle.length)} idle locations`}
        </button>
      ) : null}
    </div>
  );
}

// One line that tells the story before the table: what moved, what to check.
function FlowSummaryLine({ t, locations, report, locale }: { t: BusinessLedger; locations: LocationLedger[]; report: InventoryMovementReport; locale: AppLocale }) {
  const he = locale === "he";
  const inbound = t.receivedExternal + t.receivedUnclassified;
  const transfers = t.redistributed + t.probableRedistributed;
  const adjustments = Math.abs(t.adjustments) + t.unclassifiedDecrease;
  const flagged = locations.filter((l) => activityOf(l).flagged).length;
  const chip = (label: string, strong = false) => (
    <span key={label} className={cn("rounded-md bg-muted/60 px-2 py-0.5 tabular-nums", strong && "font-semibold text-foreground")}>
      {label}
    </span>
  );
  const chips = [
    chip(he ? `${formatNumber(t.sold)} יח׳ נמכרו` : `${formatNumber(t.sold)} units sold`, t.sold > 0),
    chip(he ? `${formatNumber(inbound)} נכנסו` : `${formatNumber(inbound)} received`, inbound > 0),
    chip(he ? `${formatNumber(transfers)} הועברו` : `${formatNumber(transfers)} transferred`, transfers > 0),
    chip(he ? `${formatNumber(adjustments)} התאמות` : `${formatNumber(adjustments)} adjustments`, adjustments > 0),
    chip(he ? `מלאי עכשיו: ${formatNumber(t.onHand)}${t.inTransit ? ` (+${formatNumber(t.inTransit)} בדרך)` : ""}` : `Stock now: ${formatNumber(t.onHand)}${t.inTransit ? ` (+${formatNumber(t.inTransit)} in transit)` : ""}`, true)
  ];
  const warn: string[] = [];
  if (flagged) warn.push(he ? `${formatNumber(flagged)} מיקומים עם תנועה שלא הוסברה במלואה` : `${formatNumber(flagged)} locations with movement not fully explained`);
  if (t.reconciliationGap !== null && t.reconciliationGap !== 0) warn.push(he ? `פער התאמה ${signed(t.reconciliationGap)}` : `reconciliation gap ${signed(t.reconciliationGap)}`);
  if (!report.openingDate) warn.push(he ? `אין נקודת פתיחה לפני התקופה${report.historyStart ? ` (היסטוריה מ-${report.historyStart})` : ""}` : `no opening point before the period${report.historyStart ? ` (history since ${report.historyStart})` : ""}`);
  if (report.evidence.transferCoverageGap) warn.push(he ? `העברות מדויקות רק מ-${report.evidence.transferCoverageSince ?? "—"}` : `exact transfers only since ${report.evidence.transferCoverageSince ?? "—"}`);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">{chips}</div>
      {warn.length ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{warn.join(" · ")}</span>
        </p>
      ) : null}
    </div>
  );
}

function ProductFootnotes({ t, locale }: { t: BusinessLedger; locale: AppLocale }) {
  const he = locale === "he";
  const lines: string[] = [];
  for (const p of t.probableTransfers.slice(0, 4)) lines.push(he ? `נראית העברה של כ-${formatNumber(p.quantity)} יח׳ ${p.fromLocationName} → ${p.toLocationName} (${p.confidence === "medium" ? "ביטחון בינוני" : "ביטחון נמוך"}, לא נרשמה ב-Shopify).` : `A probable transfer of ~${formatNumber(p.quantity)} units ${p.fromLocationName} → ${p.toLocationName} (${p.confidence} confidence, not recorded in Shopify).`);
  if (t.receivedUnclassified > 0) lines.push(he ? `${formatNumber(t.receivedUnclassified)} יח׳ נוספו ממקור לא מזוהה — לרשום PO אם זו קבלת סחורה.` : `${formatNumber(t.receivedUnclassified)} units added from an unidentified source — record the PO if this was a delivery.`);
  if (t.unclassifiedDecrease > 0) lines.push(he ? `${formatNumber(t.unclassifiedDecrease)} יח׳ ירדו מהמלאי בלי אירוע מסביר.` : `${formatNumber(t.unclassifiedDecrease)} units left stock with no explaining event.`);
  if (t.unlocatedSold > 0) lines.push(he ? `${formatNumber(t.unlocatedSold)} יח׳ נמכרו בהזמנות ללא מיקום — בסה״כ העסק בלבד.` : `${formatNumber(t.unlocatedSold)} units sold on orders without a location — business total only.`);
  if (!lines.length) return null;
  return (
    <ul className="space-y-0.5 text-[11px] text-amber-700">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

export function ProductFlow({ row, pm, report, locale, filterLocation, rangeLabel }: { row: ProductStockRow; pm: ProductMovement; report: InventoryMovementReport; locale: AppLocale; filterLocation?: string; rangeLabel?: string | null }) {
  const he = locale === "he";
  const variants = Object.values(pm.variants) as Array<VariantLedger & { variantId: string }>;
  const titleOf = new Map(row.variants.map((v) => [v.variantId, v]));
  const exact = pm.locations.reduce((s, l) => s + l.exactEvents, 0);
  const derivedUnits = pm.locations.reduce((s, l) => s + l.probableTransferIn + l.receivedUnclassified + l.unclassifiedDecrease, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{he ? "תנועות מלאי" : "Stock movement"}</p>
        {rangeLabel ? <p className="text-[10px] text-muted-foreground">{rangeLabel}</p> : null}
      </div>
      <FlowSummaryLine t={pm.total} locations={pm.locations} report={report} locale={locale} />
      <LedgerTable locations={pm.locations} total={pm.total} report={report} locale={locale} filterLocation={filterLocation} />
      {!filterLocation ? <ProductFootnotes t={pm.total} locale={locale} /> : null}
      {variants.length > 1 ? (
        <details className="text-xs">
          <summary className="cursor-pointer select-none font-semibold text-muted-foreground underline-offset-4 hover:underline">{he ? "לפי וריאציה" : "By variant"}</summary>
          <div className="mt-2 space-y-4">
            {variants.map((vm) => (
              <div key={vm.variantId}>
                <p className="mb-1 font-medium">
                  {titleOf.get(vm.variantId)?.title ?? vm.variantId}
                  {titleOf.get(vm.variantId)?.sku ? <span className="ms-2 text-muted-foreground" dir="ltr">{titleOf.get(vm.variantId)!.sku}</span> : null}
                </p>
                <LedgerTable locations={vm.locations} total={vm.total} report={report} locale={locale} filterLocation={filterLocation} />
                {!filterLocation ? <ProductFootnotes t={vm.total} locale={locale} /> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <details className="text-[11px] text-muted-foreground">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1 underline-offset-4 hover:underline">
          <Info className="h-3 w-3" aria-hidden />
          {he ? "איך מחושבים הנתונים?" : "How are these numbers computed?"}
        </summary>
        <ul className="mt-1 list-disc space-y-0.5 ps-4">
          <li>{he ? `${formatNumber(exact)} אירועים מדויקים בתקופה (העברות Shopify, קבלות PO, התאמות עם מקור) · ${formatNumber(derivedUnits)} יחידות סווגו מתוך תנועה נגזרת (≈ / ? / לא מסווג).` : `${formatNumber(exact)} exact events in the period (Shopify transfers, PO receipts, sourced adjustments) · ${formatNumber(derivedUnits)} units classified from derived movement (≈ / ? / unclassified).`}</li>
          <li>{he ? "נכנס = קבלות PO (מדויק) + עלייה שלא הוסברה ולא נמצא לה זוג במיקום אחר (? — מקור לא מזוהה). העברה פנימית לעולם לא נספרת כאן." : "In = PO receipts (exact) + an unexplained increase with no pair at another location (? — unidentified source). An internal transfer is never counted here."}</li>
          <li>{he ? "העברות = רגלי העברה של Shopify (מדויק) + זוגות של ירידה/עלייה באותו וריאנט בין מיקומים (≈ העברה סבירה, ביטחון בינוני כשהכמויות זהות, נמוך כשחלקיות). מוצג כנטו: נכנס פחות יצא; בשורת העסק — סך היחידות שחולקו." : "Transfers = Shopify transfer legs (exact) + paired decrease/increase of the same variant across locations (≈ probable, medium confidence when quantities match, low when partial). Shown net: in minus out; on the business row, total units redistributed."}</li>
          <li>{he ? "נמכר = שורות הזמנה לפי מיקום ההזמנה — קופה או המיקום שממנו סופקה הזמנה אונליין — פחות יחידות שהוחזרו. ברוטו, החזרות וקופה/אונליין ב-tooltip." : "Sold = order lines by the order's location — the till or the location an online order was fulfilled from — minus returned units. Gross, returns and till/online in the tooltip."}</li>
          <li>{he ? "התאמות = התאמות מדויקות + ירידה לא מסווגת (ירידה שלא הוסברה ולא נמצא לה זוג). בדרך = נשלח בהעברה מדויקת ועוד לא התקבל." : "Adjustments = exact adjustments + unclassified decrease (an unexplained drop with no pair). In transit = shipped on an exact transfer and not yet received."}</li>
          <li>{he ? `זהות סה״כ עסק: בתחילת התקופה + נכנס + התאמות − נמכר − ירידה לא מסווגת = פיזי + בדרך${pm.total.reconciliationGap === null ? " (לא ניתן לאמת בלי נקודת פתיחה)" : pm.total.reconciliationGap === 0 ? " · מתאזן" : ` · פער ${signed(pm.total.reconciliationGap)}`}.` : `Business identity: at start + in + adjustments − sold − unclassified decrease = on hand + in transit${pm.total.reconciliationGap === null ? " (cannot be verified without an opening point)" : pm.total.reconciliationGap === 0 ? " · closes" : ` · gap ${signed(pm.total.reconciliationGap)}`}.`}</li>
          {!report.openingDate ? <li>{he ? `אין תמונת מלאי מלפני תחילת התקופה${report.historyStart ? ` — ההיסטוריה זמינה מ-${report.historyStart}` : ""}. "בתחילת התקופה" והסיווג של תנועה לא מוסברת יופיעו כשתהיה נקודת פתיחה.` : `No stock snapshot before the period start${report.historyStart ? ` — history since ${report.historyStart}` : ""}. "At start" and the classification of unexplained movement appear once an opening point exists.`}</li> : null}
        </ul>
      </details>
    </div>
  );
}

// ── PO receipt form ────────────────────────────────────────────────────────

export function PoReceiptForm({ locations, locale, defaultLocationId }: { locations: Array<{ id: string; name: string }>; locale: AppLocale; defaultLocationId?: string | null }) {
  const he = locale === "he";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [locationId, setLocationId] = useState(defaultLocationId ?? locations[0]?.id ?? "");
  const [lines, setLines] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!locations.length) return null;
  const submit = () =>
    start(async () => {
      setErr(null);
      setMsg(null);
      const parsed = lines
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [sku, qty] = l.split(/[,\t;]+/).map((x) => x.trim());
          return { sku, quantity: Number(qty) };
        })
        .filter((l) => l.sku && Number.isFinite(l.quantity) && l.quantity > 0);
      if (!parsed.length) {
        setErr(he ? "יש להזין שורות בפורמט SKU, כמות" : "Enter lines as SKU, quantity");
        return;
      }
      try {
        const res = await fetch("/api/inventory/po-receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ poNumber, receivedAt, locationId, locationName: locations.find((l) => l.id === locationId)?.name ?? null, lines: parsed }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) throw new Error(body?.error ?? "failed");
        setMsg(he ? `נרשמו ${body.recorded} שורות (${body.units} יח׳)${body.unresolved?.length ? ` · ${body.unresolved.length} SKU לא נמצאו` : ""}` : `Recorded ${body.recorded} lines (${body.units} units)${body.unresolved?.length ? ` · ${body.unresolved.length} SKUs not found` : ""}`);
        setLines("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  const inputCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{he ? "רישום קבלת הזמנת רכש (PO)" : "Record a purchase-order receipt"}</p>
          <p className="text-xs text-muted-foreground">{he ? "מלאי חיצוני שהתקבל במיקום — נספר כקליטה חדשה (מדויק). בלי רישום, קליטה מופיעה כ״ממקור לא מזוהה״." : "External stock received at a location — counts as an exact external receipt. Unrecorded, a delivery shows as 'unidentified source'."}</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-semibold underline-offset-4 hover:underline">
          {open ? (he ? "סגור" : "Close") : he ? "רשום PO" : "Record PO"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder={he ? "מספר PO" : "PO number"} className={inputCls} dir="ltr" />
            <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={inputCls} dir="ltr" />
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <textarea value={lines} onChange={(e) => setLines(e.target.value)} rows={4} dir="ltr" placeholder={"SKU, quantity\n01063149160, 100\n01073149180, 80"} className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending || !poNumber.trim()} onClick={submit} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50">
              {he ? "שמור קבלה" : "Save receipt"}
            </button>
            {msg ? <span className="text-xs text-emerald-700">{msg}</span> : null}
            {err ? <span className="text-xs text-rose-700">{err}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
