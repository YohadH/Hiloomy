"use client";

import { LogOut } from "lucide-react";

export function AffiliateLogoutButton({ slug }: { slug: string }) {
  const logout = async () => {
    try {
      await fetch(`/api/my/${encodeURIComponent(slug)}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" })
      });
    } finally {
      window.location.href = `/my/${encodeURIComponent(slug)}`;
    }
  };
  return (
    <button
      type="button"
      onClick={logout}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      יציאה
    </button>
  );
}
