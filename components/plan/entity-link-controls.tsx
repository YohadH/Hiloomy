"use client";

// Confirm / remove an initiative → entity link. Stored as a plan override
// (`link_entity` / `unlink_entity`) next to the operator's other corrections.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MappingKind } from "@/lib/domain/initiative-reality";

export function EntityLinkButton({ sheetId, initiativeId, kind, id, label, mode, text, via }: { sheetId: string; initiativeId: string; kind: MappingKind; id: string; label: string; mode: "link" | "unlink" | "unlink_kind"; text: string; via?: string | null }) {
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
              const res = await fetch(`/api/gantt/${sheetId}/plan/overrides`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(mode === "link" ? { op: "link_entity", initiativeId, kind, id, label, via: via ?? null } : mode === "unlink_kind" ? { op: "unlink_kind", initiativeId, kind } : { op: "unlink_entity", initiativeId, kind, id })
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok || !body.ok) throw new Error(body?.error ?? "failed");
              router.refresh();
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          })
        }
        className={mode === "link" ? "rounded-md border border-foreground px-2 py-0.5 text-xs font-semibold hover:bg-foreground hover:text-background disabled:opacity-50" : "text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"}
      >
        {text}
      </button>
      {err ? <span className="text-xs text-danger">{err}</span> : null}
    </span>
  );
}
