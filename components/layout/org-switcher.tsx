"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Building2, Loader2 } from "lucide-react";
import type { AppLocale } from "@/lib/i18n";

// Organization switcher. A user can belong to more than one org (their own,
// plus any they were invited into as a teammate). This pill lets them move
// between orgs; picking one POSTs to /api/settings/active-org (which sets
// the active_org_id cookie and clears the stale active-store cookie), then
// router.refresh() re-renders every server component in the new org context.
//
// Renders NOTHING when the user has a single org — no point in a switcher.

export interface OrgSwitcherOrg {
  orgId: string;
  name: string;
  storeCount: number;
  role: string;
  isActive: boolean;
}

export function OrgSwitcher({
  orgs,
  locale = "en"
}: {
  orgs: OrgSwitcherOrg[];
  locale?: AppLocale;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const current = orgs.find((o) => o.isActive) ?? orgs[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handlePick = async (orgId: string) => {
    if (current && orgId === current.orgId) {
      setOpen(false);
      return;
    }
    setError(null);
    setSwitchingId(orgId);
    try {
      const res = await fetch("/api/settings/active-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(
          body?.error ?? (locale === "he" ? "החלפת הארגון נכשלה." : "Failed to switch organization.")
        );
      }
      setOpen(false);
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

  // One org (or none) — nothing to switch between.
  if (orgs.length <= 1) return null;

  const storeLabel = (n: number) =>
    locale === "he"
      ? n === 1
        ? "מותג אחד"
        : `${n} מותגים`
      : n === 1
      ? "1 brand"
      : `${n} brands`;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-accent"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Building2 className="h-3 w-3 text-muted-foreground" aria-hidden />
        )}
        <span className="max-w-[160px] truncate">
          {current?.name ?? (locale === "he" ? "בחרו ארגון" : "Pick organization")}
        </span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1.5 min-w-[260px] rounded-lg border border-border bg-card shadow-xl start-0">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {locale === "he" ? "הארגונים שלכם" : "Your organizations"}
          </p>
          <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
            {orgs.map((o) => {
              const isCurrent = o.isActive;
              const isLoading = switchingId === o.orgId;
              return (
                <li key={o.orgId}>
                  <button
                    type="button"
                    onClick={() => handlePick(o.orgId)}
                    disabled={isLoading || pending}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-xs transition-colors hover:bg-accent disabled:cursor-wait ${
                      isCurrent ? "bg-accent/50" : ""
                    }`}
                    role="option"
                    aria-selected={isCurrent}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{o.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {storeLabel(o.storeCount)}
                        {o.role === "owner"
                          ? locale === "he"
                            ? " · בעלים"
                            : " · owner"
                          : o.role === "admin"
                          ? locale === "he"
                            ? " · מנהל"
                            : " · admin"
                          : ""}
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
