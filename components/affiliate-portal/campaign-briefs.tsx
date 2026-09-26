"use client";

// One campaign: status switch, "add briefs" (one brief text → many creators
// at once, each gets her own row + ready link), and the brief table with
// merchant-side status actions. The creator marks "posted" from her portal;
// the merchant can correct anything here.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BRIEF_FORMATS,
  BRIEF_FORMAT_LABEL,
  BRIEF_STATUS_LABEL,
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  briefIsLate,
  type BriefFormat,
  type BriefStatus,
  type CampaignStatus
} from "@/lib/domain/affiliate-campaign";
import type { BriefRow } from "@/lib/services/affiliate-campaign-service";

type Locale = "he" | "en";
const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

interface AffiliateOption {
  id: string;
  firstName: string;
  lastName: string;
  affiliateCode: string;
  status: string;
}

export function CampaignBriefs({
  campaign,
  briefs,
  affiliates,
  locale = "he"
}: {
  campaign: { id: string; name: string; code: string; status: CampaignStatus; promoText: string | null; couponCode: string | null; destinationPath: string };
  briefs: BriefRow[];
  affiliates: AffiliateOption[];
  locale?: Locale;
}) {
  const router = useRouter();
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({ dueDate: "", format: "post" as BriefFormat, title: "", instructions: "" });

  const call = async (key: string, url: string, init: RequestInit) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || t("הפעולה נכשלה", "The action failed"));
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status: CampaignStatus) =>
    call("campaign", `/api/affiliate-portal/campaigns/${campaign.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: campaign.name, code: campaign.code, promoText: campaign.promoText, couponCode: campaign.couponCode, destinationPath: campaign.destinationPath, status })
    });

  const addBriefs = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await call("add", `/api/affiliate-portal/campaigns/${campaign.id}`, {
      method: "POST",
      body: JSON.stringify({ affiliateMemberIds: selected, dueDate: form.dueDate, format: form.format, title: form.title, instructions: form.instructions || null })
    });
    if (ok) {
      setSelected([]);
      setForm({ dueDate: "", format: "post", title: "", instructions: "" });
    }
  };

  const setBriefStatus = (id: string, status: BriefStatus) =>
    call(id, `/api/affiliate-portal/campaigns/briefs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  const removeBrief = (id: string) => {
    if (!window.confirm(t("למחוק את הבריף?", "Delete this brief?"))) return;
    return call(id, `/api/affiliate-portal/campaigns/briefs/${id}`, { method: "DELETE" });
  };

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* selectable in the cell */
    }
  };

  const visibleAffiliates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return affiliates
      .filter((a) => a.status !== "rejected" && a.status !== "inactive")
      .filter((a) => !q || `${a.firstName} ${a.lastName} ${a.affiliateCode}`.toLowerCase().includes(q));
  }, [affiliates, filter]);

  const dateFmt = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "short", timeZone: "Asia/Jerusalem" }) : "—";

  const statusCls: Record<BriefStatus, string> = {
    planned: "bg-slate-100 text-slate-700",
    posted: "bg-emerald-100 text-emerald-800",
    missed: "bg-amber-100 text-amber-800",
    cancelled: "bg-slate-200 text-slate-500"
  };

  return (
    <div className="space-y-4">
      {/* Campaign status */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4">
        <span className="text-sm font-semibold">{t("סטטוס הקמפיין", "Campaign status")}</span>
        {CAMPAIGN_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy === "campaign"}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              campaign.status === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {CAMPAIGN_STATUS_LABEL[s][locale]}
          </button>
        ))}
        <span className="ms-auto text-xs text-muted-foreground">
          {t(
            "קמפיין שהסתיים עדיין נספר, אבל הקישור כבר לא מחליף יעד או קופון.",
            "An ended campaign still attributes, but its link no longer overrides destination or coupon."
          )}
        </span>
      </div>

      {/* Add briefs */}
      <form onSubmit={addBriefs} className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">{t("הוספת בריף למשפיעניות", "Add a brief to creators")}</p>
        <p className="text-xs text-muted-foreground">
          {t(
            "בריף אחד, כמה משפיעניות — כל אחת מקבלת שורה משלה וקישור מוכן עם קוד הקמפיין.",
            "One brief, many creators — each gets her own row and a ready link carrying the campaign code."
          )}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr]">
          <div>
            <input className={inputCls} placeholder={t("חיפוש משפיענית…", "Search creators…")} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border">
              {visibleAffiliates.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t("אין משפיעניות להצגה", "No creators to show")}</p>
              ) : (
                visibleAffiliates.map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <label key={a.id} className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${on ? "bg-primary/5" : ""}`}>
                      <input type="checkbox" checked={on} onChange={() => setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))} />
                      <span className="flex-1">
                        {a.firstName} {a.lastName}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                        {a.affiliateCode}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t(`${selected.length} נבחרו`, `${selected.length} selected`)}</span>
              <button type="button" className="underline" onClick={() => setSelected(visibleAffiliates.map((a) => a.id))}>
                {t("בחירת כולן", "Select all shown")}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-medium">
              {t("כותרת הבריף", "Brief title")}
              <input required className={`${inputCls} mt-1`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("סטורי עם הקוד + לינק בסוויפ", "Story with the code + swipe-up link")} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium">
                {t("תאריך פרסום", "Due date")}
                <input required type="date" className={`${inputCls} mt-1`} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label className="text-xs font-medium">
                {t("פורמט", "Format")}
                <select className={`${inputCls} mt-1`} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as BriefFormat })}>
                  {BRIEF_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {BRIEF_FORMAT_LABEL[f][locale]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-xs font-medium">
              {t("הנחיות (אופציונלי)", "Instructions (optional)")}
              <textarea rows={3} className={`${inputCls} mt-1`} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder={t("מה להגיד, מה להראות, מה לא", "What to say, what to show, what not to")} />
            </label>
            <Button type="submit" disabled={busy === "add" || selected.length === 0}>
              {busy === "add" ? t("מוסיף…", "Adding…") : t(`הוספת בריף ל-${selected.length || "…"}`, `Add brief to ${selected.length || "…"}`)}
            </Button>
          </div>
        </div>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* Briefs table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {briefs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t("עדיין אין בריפים בקמפיין הזה.", "No briefs in this campaign yet.")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start font-semibold">{t("משפיענית", "Creator")}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t("בריף", "Brief")}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t("תאריך", "Due")}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t("סטטוס", "Status")}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t("קליקים", "Clicks")}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t("קישור", "Link")}</th>
                  <th className="px-4 py-2 text-end font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {briefs.map((b) => {
                  const late = briefIsLate(b);
                  return (
                    <tr key={b.id} className="border-t border-border/60">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold">{b.affiliateName}</p>
                        <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                          {b.instagramUsername ? `@${b.instagramUsername}` : b.affiliateCode}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p>
                          <span className="me-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">{BRIEF_FORMAT_LABEL[b.format][locale]}</span>
                          {b.title}
                        </p>
                        {b.postUrl ? (
                          <a href={b.postUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline" dir="ltr">
                            {t("הפוסט", "Post")} ↗
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {dateFmt(b.dueDate)}
                        {late ? <span className="ms-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{t("מאחר", "late")}</span> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          disabled={busy === b.id}
                          value={b.status}
                          onChange={(e) => setBriefStatus(b.id, e.target.value as BriefStatus)}
                          className={`rounded-full border-0 px-2 py-0.5 text-[11px] font-semibold ${statusCls[b.status]}`}
                        >
                          {(Object.keys(BRIEF_STATUS_LABEL) as BriefStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {BRIEF_STATUS_LABEL[s][locale]}
                            </option>
                          ))}
                        </select>
                        {b.postedAt ? <p className="mt-0.5 text-[10px] text-muted-foreground">{dateFmt(b.postedAt)}</p> : null}
                      </td>
                      <td className="px-4 py-2.5 text-end tabular-nums">{b.clicks}</td>
                      <td className="px-4 py-2.5">
                        {b.link ? (
                          <button type="button" onClick={() => copy(b.id, b.link!)} className="inline-flex max-w-[260px] items-center gap-1 rounded-lg border border-border px-2 py-1 font-mono text-[11px] hover:bg-accent" dir="ltr" title={b.link}>
                            {copied === b.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            <span className="truncate">{b.link.replace(/^https?:\/\//, "")}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{t("אין לינק קצר — צרו אחד בקופונים", "No short link — mint one under Coupons")}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-end">
                        <button type="button" disabled={busy === b.id} onClick={() => removeBrief(b.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600" title={t("מחיקה", "Delete")}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
