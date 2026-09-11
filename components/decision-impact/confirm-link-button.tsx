"use client";

// Turns a SUGGESTED initiative → calendar-event link into a CONFIRMED one.
// Stored as a plan override (`link_event`), so it survives re-reads and is
// auditable next to the operator's other corrections.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ConfirmLinkButton({ sheetId, initiativeId, eventId, label }: { sheetId: string; initiativeId: string; eventId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            try {
              const res = await fetch(`/api/gantt/${sheetId}/plan/overrides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "link_event", initiativeId, eventId }) });
              const body = await res.json().catch(() => ({}));
              if (!res.ok || !body.ok) throw new Error(body?.error ?? "link failed");
              router.refresh();
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          })
        }
        className="mt-1 rounded-md border border-foreground px-2 py-0.5 text-xs font-semibold hover:bg-foreground hover:text-background disabled:opacity-50"
      >
        {label}
      </button>
      {err ? <span className="text-xs text-danger">{err}</span> : null}
    </span>
  );
}
