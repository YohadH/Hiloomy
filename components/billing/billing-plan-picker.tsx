"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { PLANS } from "@/lib/billing/plans";
import type { PlanDefinition } from "@/lib/billing/plans";

export function BillingPlanPicker({
  locale,
  currency,
  currentPlan
}: {
  locale: "he" | "en";
  currency: "ILS" | "USD";
  currentPlan: string;
}) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t =
    locale === "he"
      ? {
          monthly: "חודשי",
          annual: "שנתי (20% הנחה)",
          perMonth: "/ חודש",
          chosen: "המסלול הנוכחי",
          choose: "בחרו במסלול",
          subscribing: "מעבירים…"
        }
      : {
          monthly: "Monthly",
          annual: "Annual (save 20%)",
          perMonth: "/ month",
          chosen: "Current plan",
          choose: "Choose plan",
          subscribing: "Redirecting…"
        };

  const fmtPrice = (n: number) => {
    if (currency === "ILS") return `₪${n}`;
    return `$${n}`;
  };

  const handleSubscribe = async (planId: string) => {
    setSubmitting(planId);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval })
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Checkout failed.");
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
      setSubmitting(null);
    }
  };

  const plans: PlanDefinition[] = [PLANS.starter, PLANS.growth, PLANS.agency];

  return (
    <div>
      <div className="mb-6 inline-flex items-center rounded-full border border-border bg-card p-1 text-xs font-medium">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={`rounded-full px-4 py-1.5 ${interval === "monthly" ? "bg-violet-700 text-white" : "text-muted-foreground"}`}
        >
          {t.monthly}
        </button>
        <button
          type="button"
          onClick={() => setInterval("annual")}
          className={`rounded-full px-4 py-1.5 ${interval === "annual" ? "bg-violet-700 text-white" : "text-muted-foreground"}`}
        >
          {t.annual}
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          ⚠ {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const price = plan.display[interval][currency];
          const isCurrent = currentPlan === plan.id;
          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 ${
                plan.id === "growth"
                  ? "border-violet-500 shadow-lg shadow-violet-100 bg-gradient-to-br from-violet-50/40 to-card"
                  : "border-border bg-card"
              }`}
            >
              <h3 className="text-lg font-bold tracking-tight">{plan.name[locale]}</h3>
              <p className="mt-1 text-xs text-muted-foreground min-h-[2.5em]">
                {plan.description[locale]}
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{fmtPrice(price)}</span>
                <span className="text-xs text-muted-foreground">{t.perMonth}</span>
              </div>
              <ul className="mt-4 space-y-2 text-xs">
                {plan.features[locale].map((feat) => (
                  <li key={feat} className="flex items-start gap-1.5">
                    <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" aria-hidden />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <p className="mt-6 text-center text-xs font-semibold text-muted-foreground">
                  {t.chosen}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={submitting === plan.id}
                  className={`mt-6 w-full inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold shadow-sm ${
                    plan.id === "growth"
                      ? "bg-violet-700 text-white hover:bg-violet-800"
                      : "bg-foreground text-background hover:opacity-90"
                  } disabled:opacity-60`}
                >
                  {submitting === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting === plan.id ? t.subscribing : t.choose}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
