"use client";

// Returning-customer commission policy editor (commission-leakage engine).
//
// Lets the merchant decide what a conversion from an already-owned
// customer is worth: full rate (default), a reduced rate, or nothing —
// with an optional win-back window that restores the full rate when the
// customer has been dormant long enough that the affiliate genuinely
// re-acquired them.
//
// Saving POSTs to /api/affiliate-portal/programs/policy, which also
// reprices all UNPAID returning-customer conversions on the spot and
// reports how many rows changed — surfaced in the success toast so the
// merchant sees the money impact immediately.

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";
type Policy = "full" | "reduced" | "zero";

interface Props {
  storeId: string;
  locale: Locale;
  baseRatePct: number;
  initialPolicy: Policy;
  initialReturningRatePct: number | null;
  initialReactivationWindowDays: number | null;
}

function labels(locale: Locale, baseRatePct: number) {
  const isHe = locale === "he";
  return {
    title: isHe ? "מדיניות עמלה ללקוח חוזר" : "Returning-customer commission policy",
    subtitle: isHe
      ? "כמה עמלה משלמים כשההזמנה מגיעה מלקוח שכבר קנה מהמותג? חלה על המרות שטרם אושרו לתשלום."
      : "How much commission is paid when the order comes from a customer the brand already owns? Applies to conversions not yet approved for payout.",
    full: isHe ? `עמלה מלאה (${baseRatePct}%)` : `Full rate (${baseRatePct}%)`,
    fullHint: isHe ? "ללא שינוי — לקוח חוזר נספר כרגיל." : "No change — returning customers count as usual.",
    reduced: isHe ? "עמלה מופחתת" : "Reduced rate",
    reducedHint: isHe
      ? "לקוח חוזר מזכה בעמלה נמוכה יותר."
      : "Returning customers earn a lower rate.",
    zero: isHe ? "ללא עמלה" : "No commission",
    zeroHint: isHe
      ? "לקוח חוזר לא מזכה בעמלה כלל."
      : "Returning customers earn nothing.",
    ratePlaceholder: isHe ? "אחוז עמלה" : "Rate %",
    windowLabel: isHe ? "חלון win-back (אופציונלי)" : "Win-back window (optional)",
    windowHint: isHe
      ? "לקוח שההזמנה הקודמת שלו ישנה מ־X ימים נחשב כלקוח שהוחזר — ומזכה בעמלה מלאה למרות המדיניות."
      : "A customer whose previous order is older than X days counts as re-acquired — earning the full rate despite the policy.",
    windowPlaceholder: isHe ? "ימים" : "Days",
    save: isHe ? "שמירת מדיניות" : "Save policy",
    saving: isHe ? "שומר…" : "Saving…",
    savedNoReprice: isHe ? "המדיניות נשמרה" : "Policy saved",
    savedWithReprice: (n: number) =>
      isHe
        ? `המדיניות נשמרה — ${n} המרות שטרם שולמו תומחרו מחדש`
        : `Policy saved — ${n} unpaid conversions repriced`,
    invalidRate: isHe ? "יש להזין אחוז עמלה בין 0 ל־100" : "Enter a rate between 0 and 100",
    errorFallback: isHe ? "שמירת המדיניות נכשלה" : "Failed to save policy"
  };
}

export function ReturningPolicyCard({
  storeId,
  locale,
  baseRatePct,
  initialPolicy,
  initialReturningRatePct,
  initialReactivationWindowDays
}: Props) {
  const t = labels(locale, baseRatePct);
  const isHe = locale === "he";
  const [policy, setPolicy] = useState<Policy>(initialPolicy);
  const [ratePct, setRatePct] = useState<string>(
    initialReturningRatePct != null ? String(initialReturningRatePct) : ""
  );
  const [windowDays, setWindowDays] = useState<string>(
    initialReactivationWindowDays != null ? String(initialReactivationWindowDays) : ""
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (policy === "reduced") {
      const pct = Number(ratePct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100 || ratePct.trim() === "") {
        toast.error(t.invalidRate);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/affiliate-portal/programs/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          policy,
          returningRatePct: policy === "reduced" ? Number(ratePct) : undefined,
          reactivationWindowDays: windowDays.trim() === "" ? null : Number(windowDays)
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const repriced = Number(body.repriced ?? 0);
      toast.success(repriced > 0 ? t.savedWithReprice(repriced) : t.savedNoReprice);
    } catch (err) {
      toast.error(err, { fallback: t.errorFallback });
    } finally {
      setSaving(false);
    }
  };

  const options: Array<{ value: Policy; label: string; hint: string }> = [
    { value: "full", label: t.full, hint: t.fullHint },
    { value: "reduced", label: t.reduced, hint: t.reducedHint },
    { value: "zero", label: t.zero, hint: t.zeroHint }
  ];

  return (
    <div
      id="returning-policy"
      dir={isHe ? "rtl" : "ltr"}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold">{t.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
              policy === opt.value
                ? "border-emerald-500 bg-emerald-50/60"
                : "border-border hover:border-emerald-300"
            )}
          >
            <input
              type="radio"
              name="returning-policy"
              value={opt.value}
              checked={policy === opt.value}
              onChange={() => setPolicy(opt.value)}
              className="mt-1 h-4 w-4 accent-emerald-600"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{opt.label}</span>
              <span className="block text-xs text-muted-foreground">{opt.hint}</span>
            </span>
            {opt.value === "reduced" && policy === "reduced" ? (
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.5}
                  value={ratePct}
                  onChange={(e) => setRatePct(e.target.value)}
                  placeholder={t.ratePlaceholder}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm tabular-nums"
                  dir="ltr"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </span>
            ) : null}
          </label>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-border p-3">
        <p className="text-sm font-semibold">{t.windowLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t.windowHint}</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
            placeholder={t.windowPlaceholder}
            className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-sm tabular-nums"
            dir="ltr"
          />
          <span className="text-xs text-muted-foreground">{isHe ? "ימים" : "days"}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {saving ? t.saving : t.save}
      </button>
    </div>
  );
}
