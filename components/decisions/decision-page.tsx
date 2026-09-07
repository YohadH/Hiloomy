"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Decision } from "@/lib/domain/decision";
import { DecisionReceipt, type DecideChoice } from "./decision-receipt";

// Full-page host for one receipt (/today/[id]) — same content as the drawer,
// with the decision persisted and the page refreshed so the footer shows
// the recorded choice.
export function DecisionPage({ decision, locale }: { decision: Decision; locale: "he" | "en" }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHe = locale === "he";

  const decide = async (choice: DecideChoice, optionKey?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decision.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice, optionKey })
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? (isHe ? "שמירת ההחלטה נכשלה." : "Saving the decision failed."));
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : isHe ? "אירעה שגיאה." : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return <DecisionReceipt decision={decision} locale={locale} onDecide={decide} busy={busy} error={error} />;
}
