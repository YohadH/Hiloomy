"use client";

import { useState, useEffect, useRef } from "react";
import { LogOut, Settings, User as UserIcon, Building2, CreditCard, History } from "lucide-react";

// Account menu sitting in the topbar — avatar + dropdown.
// Lives in the same row as the date picker / sync-now button.

export function AccountMenu({
  email,
  displayName,
  orgName,
  locale = "he"
}: {
  email: string;
  displayName?: string | null;
  orgName?: string | null;
  locale?: "he" | "en";
}) {
  const t =
    locale === "he"
      ? {
          accountSettings: "הגדרות חשבון",
          orgSettings: "הגדרות חברה",
          auditLog: "יומן ביקורת",
          billing: "מנוי וחשבונות",
          signOut: "התנתקות"
        }
      : {
          accountSettings: "Account settings",
          orgSettings: "Organization settings",
          auditLog: "Audit log",
          billing: "Billing",
          signOut: "Sign out"
        };

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (() => {
    const source = displayName?.trim() || email || "?";
    const parts = source.split(/[\s.@]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  })();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-xs font-bold shadow-sm hover:shadow-md transition-shadow"
        title={email}
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          dir={locale === "he" ? "rtl" : "ltr"}
          className="absolute end-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-card text-card-foreground shadow-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border/70">
            <p className="text-sm font-semibold truncate" title={displayName ?? email}>
              {displayName ?? email}
            </p>
            {orgName ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{orgName}</p>
            ) : null}
            {displayName ? (
              <p className="mt-1 text-[11px] text-muted-foreground truncate">{email}</p>
            ) : null}
          </div>

          <a
            href="/settings/account"
            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/60"
          >
            <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t.accountSettings}
          </a>
          <a
            href="/settings/organization"
            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/60"
          >
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t.orgSettings}
          </a>
          <a
            href="/settings/audit-log"
            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/60"
          >
            <History className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t.auditLog}
          </a>
          <a
            href="/billing"
            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/60"
          >
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t.billing}
          </a>

          <div className="border-t border-border/70">
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/60 text-foreground"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden />
                {t.signOut}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
