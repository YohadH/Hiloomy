"use client";

// Campaigns list + "new campaign" form for /affiliate-portal/campaigns.
// A campaign = a named push with a link code; the code becomes the suffix of
// every affiliate's short link ({token}-{code}) so clicks and orders roll up
// to the campaign without any extra setup on the affiliate's side.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CAMPAIGN_STATUS_LABEL, type CampaignStatus } from "@/lib/domain/affiliate-campaign";
import type { CampaignSummary } from "@/lib/services/affiliate-campaign-service";

type Locale = "he" | "en";

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function CampaignManager({
  campaigns,
  currency,
  locale = "he"
}: {
  campaigns: CampaignSummary[];
  currency: string;
  locale?: Locale;
}) {
  const router = useRouter();
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [open, setOpen] = useState(campaigns.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    promoText: "",
    couponCode: "",
    destinationPath: "",
    startsAt: "",
    endsAt: ""
  });

  const money = (n: number) =>
    new Intl.NumberFormat(isHe ? "he-IL" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const date = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "short" }) : "—";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/affiliate-portal/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          promoText: form.promoText || null,
          couponCode: form.couponCode || null,
          destinationPath: form.destinationPath || null,
          startsAt: form.startsAt || null,
          endsAt: form.endsAt || null,
          status: "active"
        })
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; campaign?: { id: string } };
      if (!res.ok || !json.ok) throw new Error(json.error || t("היצירה נכשלה", "Could not create the campaign"));
      setForm({ name: "", code: "", promoText: "", couponCode: "", destinationPath: "", startsAt: "", endsAt: "" });
      setOpen(false);
      if (json.campaign?.id) router.push(`/affiliate-portal/campaigns/${json.campaign.id}` as never);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const statusCls: Record<CampaignStatus, string> = {
    active: "bg-emerald-100 text-emerald-800",
    draft: "bg-slate-100 text-slate-700",
    ended: "bg-slate-200 text-slate-600"
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t("קמפיין חדש", "New campaign")}</p>
            <p className="text-xs text-muted-foreground">
              {t(
                "שם, קוד קצר לקישור, ואופציונלי: קופון, עמוד יעד ותאריכים. את הבריפים למשפיעניות מוסיפים בעמוד הקמפיין.",
                "Name, a short link code and, optionally, a coupon, landing path and dates. Briefs for creators are added on the campaign page."
              )}
            </p>
          </div>
          <Button type="button" variant={open ? "secondary" : "default"} size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? t("סגירה", "Close") : t("+ קמפיין", "+ Campaign")}
          </Button>
        </div>
        {open ? (
          <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium">
              {t("שם הקמפיין", "Campaign name")}
              <input required className={`${inputCls} mt-1`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("למשל: השקת קולקציית חורף", "e.g. Winter launch")} />
            </label>
            <label className="text-xs font-medium">
              {t("קוד לקישור", "Link code")}
              <input
                required
                dir="ltr"
                className={`${inputCls} mt-1 font-mono`}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="winter26"
              />
              <span className="mt-1 block text-[11px] font-normal text-muted-foreground" dir="ltr">
                hiloomy.com/l/&#123;token&#125;-{form.code || "code"}
              </span>
            </label>
            <label className="text-xs font-medium md:col-span-2">
              {t("מסר לקידום (מה שהמשפיענית רואה)", "Promo text (what the creator sees)")}
              <input className={`${inputCls} mt-1`} value={form.promoText} onChange={(e) => setForm({ ...form, promoText: e.target.value })} placeholder={t("20% על כל הקולקציה החדשה עד יום שישי", "20% off the new collection until Friday")} />
            </label>
            <label className="text-xs font-medium">
              {t("קופון לקמפיין (אופציונלי)", "Campaign coupon (optional)")}
              <input dir="ltr" className={`${inputCls} mt-1 font-mono`} value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value })} placeholder="WINTER20" />
              <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                {t("גובר על הקופון של הלינק האישי כשהקישור נושא את קוד הקמפיין.", "Overrides the personal link coupon when the link carries this code.")}
              </span>
            </label>
            <label className="text-xs font-medium">
              {t("עמוד יעד בחנות (אופציונלי)", "Landing path (optional)")}
              <input dir="ltr" className={`${inputCls} mt-1 font-mono`} value={form.destinationPath} onChange={(e) => setForm({ ...form, destinationPath: e.target.value })} placeholder="/collections/winter" />
            </label>
            <label className="text-xs font-medium">
              {t("התחלה", "Starts")}
              <input type="date" className={`${inputCls} mt-1`} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </label>
            <label className="text-xs font-medium">
              {t("סיום", "Ends")}
              <input type="date" className={`${inputCls} mt-1`} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </label>
            {error ? <p className="text-sm text-red-600 md:col-span-2">{error}</p> : null}
            <div className="md:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? t("יוצר…", "Creating…") : t("יצירת קמפיין", "Create campaign")}
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {campaigns.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t("עדיין אין קמפיינים. צרו את הראשון למעלה.", "No campaigns yet. Create the first one above.")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start font-semibold">{t("קמפיין", "Campaign")}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t("סטטוס", "Status")}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t("תאריכים", "Dates")}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t("משפיעניות", "Creators")}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t("בריפים · פורסמו", "Briefs · posted")}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t("קליקים", "Clicks")}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t("הזמנות", "Orders")}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t("מכירות", "Sales")}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link href={`/affiliate-portal/campaigns/${c.id}` as never} className="font-semibold text-foreground hover:underline">
                        {c.name}
                      </Link>
                      <span className="ms-2 font-mono text-[11px] text-muted-foreground" dir="ltr">
                        -{c.code}
                      </span>
                      {c.promoText ? <p className="text-xs text-muted-foreground">{c.promoText}</p> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusCls[c.status]}`}>
                        {CAMPAIGN_STATUS_LABEL[c.status][locale]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {date(c.startsAt)} – {date(c.endsAt)}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{c.affiliates}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {c.briefs} · <span className="text-emerald-700">{c.posted}</span>
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{c.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{c.orders.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-end font-semibold tabular-nums">{money(c.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
