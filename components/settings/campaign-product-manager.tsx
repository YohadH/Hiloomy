"use client";

// Campaign ↔ product links manager (F-013/F-004).
//
// Meta campaign names are free text, so nothing in the data says which
// product a campaign pushes. The owner tags campaigns here once; the
// alert engines then join live campaign state against stock/sales
// ("campaign still spending on a product about to run out"). Same client
// CRUD pattern as CompetitorSetManager, against /api/campaign-links.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Megaphone, X } from "lucide-react";

interface LinkedProduct {
  productId: string;
  title: string;
}

interface CampaignRow {
  campaignId: string;
  campaignName: string;
  spend: number;
  purchases: number;
  active: boolean;
  linkedProducts: LinkedProduct[];
}

export function CampaignProductManager({ isHe }: { isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [products, setProducts] = useState<LinkedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const resp = await fetch("/api/campaign-links", { cache: "no-store" });
      const body = await resp.json();
      if (!resp.ok || !body?.ok)
        throw new Error(body?.error ?? (isHe ? "הטעינה נכשלה." : "Failed to load."));
      setCampaigns(body.campaigns ?? []);
      setProducts(body.products ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : isHe ? "הטעינה נכשלה." : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [isHe]);

  useEffect(() => {
    load();
  }, [load]);

  const addLink = async (campaign: CampaignRow, productId: string) => {
    if (!productId) return;
    setBusyKey(campaign.campaignId);
    setError(null);
    try {
      const resp = await fetch("/api/campaign-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          productId
        })
      });
      const body = await resp.json();
      if (!resp.ok || !body?.ok) throw new Error(body?.error ?? lang("השמירה נכשלה.", "Save failed."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : lang("השמירה נכשלה.", "Save failed."));
    } finally {
      setBusyKey(null);
    }
  };

  const removeLink = async (campaignId: string, productId: string) => {
    setBusyKey(campaignId);
    setError(null);
    try {
      const resp = await fetch("/api/campaign-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, productId })
      });
      const body = await resp.json();
      if (!resp.ok || !body?.ok) throw new Error(body?.error ?? lang("המחיקה נכשלה.", "Remove failed."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : lang("המחיקה נכשלה.", "Remove failed."));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Megaphone className="h-4 w-4" aria-hidden />
          {lang("קישור קמפיינים למוצרים", "Campaign → product links")}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {lang(
            "סמנו לכל קמפיין את המוצרים שהוא מקדם. זה מה שמאפשר התראות חכמות: קמפיין שממשיך להוציא כסף על מוצר שעומד להיגמר במלאי, או קמפיין שמביא קליקים למוצר שלא נמכר.",
            "Tag each campaign with the products it promotes. This powers the smart alerts: a campaign still spending on a product about to stock out, or a campaign sending clicks to a product that isn't selling."
          )}
        </p>
      </div>

      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {lang("טוען קמפיינים...", "Loading campaigns...")}
        </p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {lang(
            "לא נמצאו קמפיינים ב־30 הימים האחרונים. חברו את Meta Ads והריצו סנכרון.",
            "No campaigns found in the last 30 days. Connect Meta Ads and run a sync."
          )}
        </p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div key={campaign.campaignId} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold" title={campaign.campaignName}>
                  {campaign.campaignName}
                </p>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  {campaign.active ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                      {lang("פעיל", "Active")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5">{lang("לא פעיל", "Inactive")}</span>
                  )}
                  <span dir="ltr">₪{Math.round(campaign.spend).toLocaleString()}</span>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {campaign.linkedProducts.map((p) => (
                  <span
                    key={p.productId}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900"
                  >
                    {p.title}
                    <button
                      type="button"
                      onClick={() => removeLink(campaign.campaignId, p.productId)}
                      disabled={busyKey === campaign.campaignId}
                      aria-label={lang(`הסרת ${p.title}`, `Remove ${p.title}`)}
                      className="text-emerald-700 hover:text-emerald-950"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </span>
                ))}
                <select
                  value=""
                  onChange={(e) => addLink(campaign, e.target.value)}
                  disabled={busyKey === campaign.campaignId}
                  className="h-7 rounded-lg border border-border bg-background px-2 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  aria-label={lang("הוספת מוצר לקמפיין", "Link a product to this campaign")}
                >
                  <option value="">{lang("+ קישור מוצר...", "+ Link product...")}</option>
                  {products
                    .filter((p) => !campaign.linkedProducts.some((l) => l.productId === p.productId))
                    .map((p) => (
                      <option key={p.productId} value={p.productId}>
                        {p.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
