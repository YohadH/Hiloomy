"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Decision } from "@/lib/domain/decision";
import { DecisionCard } from "./decision-card";
import { DecisionDrawer } from "./decision-drawer";
import type { DecideChoice } from "./decision-receipt";

type Locale = "he" | "en";

// Client shell for the inbox: owns which receipt is open and posts the
// manager's decision. A decided card leaves the list immediately (it now
// belongs to Memory) and the page re-fetches so the counts follow.
export function DecisionInbox({
  decisions,
  locale,
  reviewed,
  initialOpenId
}: {
  decisions: Decision[];
  locale: Locale;
  reviewed: number;
  initialOpenId?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [list, setList] = useState(decisions);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);

  const decide = useCallback(
    async (id: string, choice: DecideChoice, optionKey?: string) => {
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(`/api/decisions/${id}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choice, optionKey })
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) throw new Error(body.error ?? t("שמירת ההחלטה נכשלה.", "Saving the decision failed."));
        setList((prev) => prev.filter((d) => d.id !== id));
        setOpenId(null);
        startTransition(() => router.refresh());
      } catch (e) {
        setError(e instanceof Error ? e.message : t("אירעה שגיאה.", "Something went wrong."));
      } finally {
        setBusyId(null);
      }
    },
    [router, t]
  );

  const open = list.find((d) => d.id === openId) ?? null;
  const close = useCallback(() => setOpenId(null), []);

  if (list.length === 0) {
    return (
      <Card className="border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-500/20 dark:bg-emerald-500/5">
        <div className="flex flex-col items-start gap-3 p-8 sm:flex-row sm:items-center sm:gap-5">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("שום דבר לא דורש את ההחלטה שלכם כרגע.", "Nothing needs your decision right now.")}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {t(
                `הילומי סקרה ${reviewed.toLocaleString("en-US")} אותות עסקיים ושוקיים. הכול נשאר בגבולות הצפוי.`,
                `Hiloomy reviewed ${reviewed.toLocaleString("en-US")} business and market signals. Everything remains within expected conditions.`
              )}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {list.map((d) => (
          <DecisionCard
            key={d.id}
            decision={d}
            locale={locale}
            onOpen={setOpenId}
            onIgnore={(id) => void decide(id, "ignore")}
            busy={busyId === d.id}
          />
        ))}
        {error && !open ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
      <DecisionDrawer
        decision={open}
        locale={locale}
        onClose={close}
        onDecide={(choice, optionKey) => open && void decide(open.id, choice, optionKey)}
        busy={busyId !== null && busyId === open?.id}
        error={error}
      />
    </>
  );
}
