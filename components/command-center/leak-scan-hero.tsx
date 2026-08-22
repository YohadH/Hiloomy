// Leak Scan hero — the first thing the founder sees after login.
//
// One number ("מצאנו ₪X דליפות רווח ב־30 הימים האחרונים") followed by the
// leak rows in the battle-card contract: ₪ LOST → REASON → ACTION →
// EXPECTED IMPACT, each deep-linking to the screen where the fix lives.
// Legs missing prerequisites render as unlock hints — the scan tells the
// truth about what it could and couldn't check.

import Link from "next/link";
import { ArrowRight, Lock, ShieldCheck, Siren } from "lucide-react";
import type { LeakScanReport, LeakItem } from "@/lib/services/leak-scan-service";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

function LeakRow({
  item,
  currency,
  isHe
}: {
  item: LeakItem;
  currency: string;
  isHe: boolean;
}) {
  const t = (v: { he: string; en: string }) => (isHe ? v.he : v.en);

  if (!item.available) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-background/60 px-4 py-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">{t(item.reason)}</p>
          {item.unlockHint ? <p className="mt-0.5 text-xs text-muted-foreground">{t(item.unlockHint)}</p> : null}
        </div>
      </div>
    );
  }

  const leaking = item.amount > 0;
  return (
    <Link
      href={item.href as never}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
        leaking
          ? "border-orange-200 bg-orange-50/60 hover:border-orange-400"
          : "border-emerald-200 bg-emerald-50/40 hover:border-emerald-400"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {leaking ? (
          <Siren className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden />
        ) : (
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        )}
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", leaking ? "text-orange-950" : "text-emerald-950")}>
            {t(item.reason)}
          </p>
          {item.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{t(item.detail)}</p> : null}
          {leaking ? (
            <p className="mt-1 text-xs font-medium text-emerald-800">
              {isHe ? "פעולה: " : "Action: "}
              {t(item.action)}
              {item.monthlyImpact > 0 ? (
                <span className="font-bold">
                  {" "}
                  · {isHe ? "פוטנציאל" : "potential"} +{formatCurrency(item.monthlyImpact, currency)}/{isHe ? "חודש" : "mo"}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 ps-7 sm:ps-0">
        <span
          className={cn(
            "text-lg font-bold tabular-nums",
            leaking ? "text-orange-700" : "text-emerald-700"
          )}
        >
          {leaking ? formatCurrency(item.amount, currency) : "✓"}
        </span>
        <ArrowRight
          className={cn("h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5", isHe && "rotate-180 group-hover:-translate-x-0.5 group-hover:translate-x-0")}
          aria-hidden
        />
      </div>
    </Link>
  );
}

export function LeakScanHero({
  scan,
  currency,
  isHe
}: {
  scan: LeakScanReport;
  currency: string;
  isHe: boolean;
}) {
  const leaking = scan.total > 0;
  return (
    <section
      className={cn(
        "rounded-2xl border p-5 sm:p-6",
        leaking
          ? "border-orange-300 bg-gradient-to-br from-orange-50/80 via-background to-emerald-50/40"
          : "border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-background to-background"
      )}
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
        Hiloomy Leak Scan · {isHe ? `${scan.windowDays} הימים האחרונים` : `last ${scan.windowDays} days`}
      </p>
      {leaking ? (
        <>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
            {isHe ? "מצאנו " : "We found "}
            <span className="text-orange-700 tabular-nums">{formatCurrency(scan.total, currency)}</span>
            {isHe ? " דליפות רווח" : " in profit leaks"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isHe
              ? "כסף שיוצא מהעסק בלי סיבה — עם הפעולה שסוגרת כל דליפה."
              : "Money leaving the business for no reason — with the action that closes each leak."}
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl text-emerald-900">
            {isHe ? "לא נמצאו דליפות רווח פעילות" : "No active profit leaks found"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isHe
              ? `${scan.legsAvailable} בדיקות רצו על החלון האחרון — הכל נקי. נמשיך לסרוק כל סנכרון.`
              : `${scan.legsAvailable} checks ran on the latest window — all clean. We keep scanning on every sync.`}
          </p>
        </>
      )}
      <div className="mt-4 space-y-2">
        {scan.items.map((item) => (
          <LeakRow key={item.id} item={item} currency={currency} isHe={isHe} />
        ))}
      </div>
    </section>
  );
}
