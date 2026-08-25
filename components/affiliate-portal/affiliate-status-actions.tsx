"use client";

// Directory row actions (HLA-12/B5+B8): approve/reject pending affiliates,
// and mint a copyable one-time login link (the no-email fallback for the
// affiliate dashboard).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Loader2, X } from "lucide-react";
import { toast } from "@/components/ui/toast";

export function AffiliateStatusActions({
  affiliateId,
  status,
  isHe
}: {
  affiliateId: string;
  status: string;
  isHe: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const lang = (he: string, en: string) => (isHe ? he : en);

  const setStatus = async (next: "approved" | "denied") => {
    setBusy(next);
    try {
      const res = await fetch(`/api/affiliate-portal/affiliates/${affiliateId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? lang("הפעולה נכשלה", "Action failed"));
      toast.success(
        next === "approved" ? lang("השותפ/ה אושרו", "Affiliate approved") : lang("ההרשמה נדחתה", "Signup rejected")
      );
      router.refresh();
    } catch (err) {
      toast.error(err, { fallback: lang("הפעולה נכשלה", "Action failed") });
    } finally {
      setBusy(null);
    }
  };

  const copyLoginLink = async () => {
    setBusy("link");
    try {
      const res = await fetch(`/api/affiliate-portal/affiliates/${affiliateId}/login-link`, {
        method: "POST"
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok || !body.url) throw new Error(body?.error ?? lang("הפעולה נכשלה", "Action failed"));
      await navigator.clipboard.writeText(body.url);
      toast.success(
        lang("קישור כניסה הועתק — תקף ל־15 דקות, שלחו לשותפ/ה", "Login link copied — valid 15 minutes, send it to the affiliate")
      );
    } catch (err) {
      toast.error(err, { fallback: lang("הפעולה נכשלה", "Action failed") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {status === "pending" ? (
        <>
          <button
            type="button"
            onClick={() => setStatus("approved")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === "approved" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {lang("אישור", "Approve")}
          </button>
          <button
            type="button"
            onClick={() => setStatus("denied")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            {busy === "denied" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            {lang("דחייה", "Reject")}
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={copyLoginLink}
        disabled={busy !== null}
        title={lang("העתקת קישור כניסה לדשבורד השותפ/ה", "Copy a login link to the affiliate's dashboard")}
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {busy === "link" ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
        {lang("קישור כניסה", "Login link")}
      </button>
    </div>
  );
}
