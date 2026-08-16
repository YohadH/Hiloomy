"use client";

// Payouts view — grouped "who do I owe" list with per-affiliate
// mark-paid actions. Fetches from /api/affiliate-portal/payouts/summary.
//
// State model matches the payout state machine in
// lib/services/affiliate-payout-service.ts:
//   unpaid → approved → paid   (happy path)
//
// The "Mark as paid" button sets ALL of that affiliate's approved
// attributions to paid in a single call (the API accepts up to 1000 ids
// per call). It also fetches those ids first — the summary endpoint gives
// us aggregates, not row ids.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";

interface PayoutRow {
  affiliateMemberId: string;
  firstName: string;
  lastName: string;
  email: string;
  payoutMethod: string | null;
  payoutDetails: string | null;
  approvedCommission: number;
  approvedCount: number;
  unpaidCommission: number;
  unpaidCount: number;
}

interface Totals {
  approvedCommission: number;
  approvedCount: number;
  unpaidCommission: number;
  unpaidCount: number;
}

function labels(locale: Locale) {
  const isHe = locale === "he";
  return {
    totalsHeading: isHe ? "מצב עמלות" : "Commission state",
    approved: isHe ? "מאושר לתשלום" : "Approved (payout-ready)",
    unpaid: isHe ? "בהמתנה" : "Awaiting approval",
    refresh: isHe ? "רענון" : "Refresh",
    approveAll: isHe ? "אשרו את כל ההמרות בהמתנה" : "Approve all pending",
    markPaid: isHe ? "סמנו כשולם" : "Mark as paid",
    workingApprove: isHe ? "מאשר…" : "Approving…",
    workingPay: isHe ? "מסמן…" : "Marking…",
    tableHeadAffiliate: isHe ? "שותף/ה" : "Affiliate",
    tableHeadMethod: isHe ? "אמצעי תשלום" : "Payment method",
    tableHeadUnpaid: isHe ? "בהמתנה" : "Unpaid",
    tableHeadApproved: isHe ? "מאושר" : "Approved",
    tableHeadActions: isHe ? "פעולות" : "Actions",
    noData: isHe ? "אין כרגע עמלות בהמתנה או לתשלום." : "No commissions currently pending or approved.",
    approvedToast: (n: number) => (isHe ? `אושרו ${n} המרות` : `Approved ${n} conversions`),
    paidToast: (n: number, name: string) =>
      isHe ? `סומנו ${n} המרות כשולמו ל${name}` : `Marked ${n} conversions paid for ${name}`,
    noApproved: isHe ? "אין המרות מאושרות עבור השותף/ה" : "No approved conversions for this affiliate",
    errorFallback: isHe ? "הפעולה נכשלה" : "Action failed"
  };
}

export function PayoutsView({ locale, currency }: { locale: Locale; currency: string }) {
  const t = labels(locale);
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingAll, setApprovingAll] = useState(false);
  const [payingMemberId, setPayingMemberId] = useState<string | null>(null);
  const isHe = locale === "he";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/affiliate-portal/payouts/summary", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setRows(body.summary ?? []);
      setTotals(body.totals ?? null);
    } catch (err) {
      toast.error(err, { fallback: t.errorFallback });
    } finally {
      setLoading(false);
    }
  }, [t.errorFallback]);

  useEffect(() => {
    load();
  }, [load]);

  const approveAllPending = async () => {
    setApprovingAll(true);
    try {
      // Fetch all unpaid attribution ids, then batch-approve.
      const listRes = await fetch(
        "/api/affiliate-portal/conversions/list-ids?payoutStatus=unpaid",
        { cache: "no-store" }
      );
      const listBody = await listRes.json().catch(() => ({}));
      if (!listRes.ok || !listBody.ok) {
        throw new Error(listBody.error || `HTTP ${listRes.status}`);
      }
      const ids: string[] = listBody.attributionIds ?? [];
      if (ids.length === 0) {
        toast.info(isHe ? "אין המרות בהמתנה" : "No pending conversions");
        return;
      }
      const res = await fetch("/api/affiliate-portal/conversions/payout-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributionIds: ids, targetStatus: "approved" })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success(t.approvedToast(body.result?.updated ?? 0));
      await load();
    } catch (err) {
      toast.error(err, { fallback: t.errorFallback });
    } finally {
      setApprovingAll(false);
    }
  };

  const markMemberPaid = async (row: PayoutRow) => {
    if (row.approvedCount === 0) {
      toast.info(t.noApproved);
      return;
    }
    setPayingMemberId(row.affiliateMemberId);
    try {
      const listRes = await fetch(
        `/api/affiliate-portal/conversions/list-ids?payoutStatus=approved&affiliateMemberId=${encodeURIComponent(row.affiliateMemberId)}`,
        { cache: "no-store" }
      );
      const listBody = await listRes.json().catch(() => ({}));
      if (!listRes.ok || !listBody.ok) {
        throw new Error(listBody.error || `HTTP ${listRes.status}`);
      }
      const ids: string[] = listBody.attributionIds ?? [];
      if (ids.length === 0) {
        toast.info(t.noApproved);
        return;
      }
      const res = await fetch("/api/affiliate-portal/conversions/payout-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributionIds: ids,
          targetStatus: "paid",
          note: `${row.firstName} ${row.lastName} · ${new Date().toISOString().slice(0, 10)}`
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success(t.paidToast(body.result?.updated ?? 0, `${row.firstName} ${row.lastName}`));
      await load();
    } catch (err) {
      toast.error(err, { fallback: t.errorFallback });
    } finally {
      setPayingMemberId(null);
    }
  };

  return (
    <div className="space-y-4" dir={isHe ? "rtl" : "ltr"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{t.approved}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">
            {formatCurrency(totals?.approvedCommission ?? 0, currency)}
          </p>
          <p className="mt-0.5 text-xs text-emerald-800">
            {totals?.approvedCount ?? 0}{" "}
            {isHe ? "המרות" : "conversions"}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{t.unpaid}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-900">
            {formatCurrency(totals?.unpaidCommission ?? 0, currency)}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            {totals?.unpaidCount ?? 0}{" "}
            {isHe ? "המרות" : "conversions"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={approveAllPending}
          disabled={approvingAll || loading}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:border-emerald-500 disabled:opacity-50"
          )}
        >
          {approvingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {approvingAll ? t.workingApprove : t.approveAll}
        </button>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t.refresh}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start font-semibold">{t.tableHeadAffiliate}</th>
              <th className="px-4 py-3 text-start font-semibold">{t.tableHeadMethod}</th>
              <th className="px-4 py-3 text-end font-semibold">{t.tableHeadUnpaid}</th>
              <th className="px-4 py-3 text-end font-semibold">{t.tableHeadApproved}</th>
              <th className="px-4 py-3 text-end font-semibold">{t.tableHeadActions}</th>
            </tr>
          </thead>
          <tbody>
            {rows == null || loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t.noData}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.affiliateMemberId} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {r.firstName} {r.lastName}
                    </div>
                    <div className="text-xs text-slate-500">{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.payoutMethod ? (
                      <>
                        <div className="font-medium">{r.payoutMethod}</div>
                        {r.payoutDetails ? (
                          <div className="font-mono text-xs text-slate-500">{r.payoutDetails}</div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-amber-700">
                        {isHe ? "לא הוגדר" : "Not configured"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    <div>{formatCurrency(r.unpaidCommission, currency)}</div>
                    <div className="text-xs text-slate-500">
                      {r.unpaidCount} {isHe ? "המרות" : "conv."}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums font-semibold text-emerald-900">
                    <div>{formatCurrency(r.approvedCommission, currency)}</div>
                    <div className="text-xs font-normal text-emerald-700">
                      {r.approvedCount} {isHe ? "המרות" : "conv."}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      type="button"
                      onClick={() => markMemberPaid(r)}
                      disabled={r.approvedCount === 0 || payingMemberId === r.affiliateMemberId}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                        r.approvedCount === 0
                          ? "cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400"
                          : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                      )}
                    >
                      {payingMemberId === r.affiliateMemberId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {payingMemberId === r.affiliateMemberId ? t.workingPay : t.markPaid}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
