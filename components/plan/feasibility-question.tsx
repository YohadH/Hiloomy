"use client";

// One feasibility question Hiloomy asks the manager ("can X be replenished
// within 8 days?"). The answer is stored as a plan override fact with a
// validity, and the initiative is re-evaluated at once. Unknown stays a
// valid answer — it keeps the conditional branches.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FeasibilityQuestion as Q } from "@/lib/domain/decision-space";

export function FeasibilityQuestion({ sheetId, initiativeId, q, locale, coverDays }: { sheetId: string; initiativeId: string; q: Q; locale: "he" | "en"; coverDays: number | null }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const answer = (value: "yes" | "no" | "unknown") =>
    start(async () => {
      setErr(null);
      try {
        const key = q.key === "replenishment" ? "replenishment_possible" : q.key === "gift_optional" ? "gift_optional" : "alternative_gift";
        const ops: Array<Record<string, unknown>> = [{ op: "set_fact", initiativeId, productId: q.productId, key, value: value === "unknown" ? "" : value, validDays: 14 }];
        if (q.key === "replenishment" && value === "yes" && coverDays !== null) ops.push({ op: "set_fact", initiativeId, productId: q.productId, key: "replenishment_days", value: String(coverDays), validDays: 14 });
        for (const op of ops) {
          const res = await fetch(`/api/gantt/${sheetId}/plan/overrides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body?.error ?? "failed");
        }
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <p className="font-medium">{q.question[locale]}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("כן", "Yes")} → {q.ifYes[locale]} · {t("לא", "No")} → {q.ifNo[locale]}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => answer("yes")} className="rounded-md border border-foreground px-3 py-1 text-xs font-semibold hover:bg-foreground hover:text-background disabled:opacity-50">
          {t("כן", "Yes")}
        </button>
        <button type="button" disabled={pending} onClick={() => answer("no")} className="rounded-md border border-foreground px-3 py-1 text-xs font-semibold hover:bg-foreground hover:text-background disabled:opacity-50">
          {t("לא", "No")}
        </button>
        <button type="button" disabled={pending} onClick={() => answer("unknown")} className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50">
          {t("לא יודע/ת", "Don't know")}
        </button>
      </div>
      {err ? <p className="mt-1 text-xs text-danger">{err}</p> : null}
    </div>
  );
}
