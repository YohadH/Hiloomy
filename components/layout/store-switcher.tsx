"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Plus, Loader2 } from "lucide-react";
import type { AppLocale } from "@/lib/i18n";

// Multi-brand operator switcher. Renders the current brand as a clickable
// pill; clicking opens a dropdown of every installed brand. Picking one
// POSTs to /api/settings/active-store which sets the active_store_id
// cookie httpOnly, then router.refresh() rerenders every server component
// with the new store context.
//
// Single-tenant operator mode — the dropdown lists ALL stores. When we
// add user auth, we'll scope this to "stores the current user has access
// to" via a membership join.

export interface StoreSwitcherStore {
  id: string;
  name: string;
  domain: string;
  connected: boolean;
}

export function StoreSwitcher({
  currentStoreId,
  stores,
  installHref = "/connect-brand",
  locale = "en"
}: {
  currentStoreId: string;
  stores: StoreSwitcherStore[];
  // Where "+ Connect another brand" links to. Defaults to settings;
  // once OAuth is live this can point at /api/shopify/oauth/install.
  installHref?: string;
  locale?: AppLocale;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const current = stores.find((s) => s.id === currentStoreId) ?? stores[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handlePick = async (storeId: string) => {
    if (storeId === currentStoreId) {
      setOpen(false);
      return;
    }
    setError(null);
    setSwitchingId(storeId);
    try {
      const res = await fetch("/api/settings/active-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(
          body?.error ?? (locale === "he" ? "החלפת החנות נכשלה." : "Failed to switch store.")
        );
      }
      setOpen(false);
      // Refresh all server components so the new active store flows through.
      startTransition(() => router.refresh());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : locale === "he"
          ? "אירעה שגיאה לא צפויה."
          : "Unexpected error."
      );
    } finally {
      setSwitchingId(null);
    }
  };

  // Single-brand mode — no point showing a switcher with one option. We
  // still render an inline "+ Connect another brand" affordance so the
  // operator can easily install a second brand.
  if (stores.length <= 1) {
    return (
      <a
        href={installHref}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-3 w-3" />
        {locale === "he" ? "חיבור מותג נוסף" : "Connect another brand"}
      </a>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-accent"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
        <span>{current?.name ?? (locale === "he" ? "בחרו מותג" : "Pick brand")}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      {/* Panel uses bg-card, NOT bg-popover — this project's Tailwind theme
          has no `popover` color token, so bg-popover compiles to nothing and
          the page text bleeds straight through the open dropdown. */}
      {open ? (
        <div className="absolute z-50 mt-1.5 min-w-[260px] rounded-lg border border-border bg-card shadow-xl start-0">
          <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
            {stores.map((s) => {
              const isCurrent = s.id === currentStoreId;
              const isLoading = switchingId === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(s.id)}
                    disabled={isLoading || pending}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-xs transition-colors hover:bg-accent disabled:cursor-wait ${
                      isCurrent ? "bg-accent/50" : ""
                    }`}
                    role="option"
                    aria-selected={isCurrent}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {s.domain}
                        {!s.connected ? (locale === "he" ? " · לא מחובר" : " · not connected") : ""}
                      </p>
                    </div>
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" aria-hidden />
                    ) : isCurrent ? (
                      <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border">
            <a
              href={installHref}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {locale === "he" ? "חיבור מותג נוסף" : "Connect another brand"}
            </a>
          </div>
          {error ? (
            <p className="border-t border-border bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              ⚠ {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
