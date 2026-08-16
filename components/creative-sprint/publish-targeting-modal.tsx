"use client";

// Publish targeting modal — collects the last bits of config Meta needs
// before we can create the campaign: which Page runs the ads, which Pixel
// tracks conversions, where the ads link to, and (loosely) audience.
//
// We pull pages/pixels from /api/creative-sprint/meta-config so the
// operator picks from real options rather than typing IDs by hand.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n";

interface Props {
  sprintId: string;
  locale: AppLocale;
  onClose: () => void;
  onPublished: () => void;
}

interface MetaConfig {
  ok: boolean;
  connected: boolean;
  pages: Array<{ id: string; name: string; instagramId?: string | null }>;
  pixels: Array<{ id: string; name: string }>;
  errors?: { pages: string | null; pixels: string | null };
}

export function PublishTargetingModal({ sprintId, locale, onClose, onPublished }: Props) {
  const t = locale === "he";
  const [config, setConfig] = useState<MetaConfig | null>(null);
  const [pageId, setPageId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [countries, setCountries] = useState("IL");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/creative-sprint/meta-config");
        const body = (await res.json()) as MetaConfig;
        setConfig(body);
        if (body.pages?.[0]) setPageId(body.pages[0].id);
        if (body.pixels?.[0]) setPixelId(body.pixels[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/creative-sprint/${sprintId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pageId,
          pixelId,
          linkUrl,
          callToAction: "SHOP_NOW",
          customEventType: "PURCHASE",
          targeting: {
            geo_locations: { countries: countries.split(",").map((c) => c.trim()).filter(Boolean) },
            age_min: ageMin,
            age_max: ageMax,
            publisher_platforms: ["facebook", "instagram"]
          }
        })
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t ? "הגדירו פרסום לMeta" : "Configure Meta publish"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t
            ? "בחרו דף Facebook, פיקסל וכתובת יעד. כל המודעות בספרינט ישתמשו באותו קהל."
            : "Pick a Page, Pixel and destination URL. Every ad in the sprint shares this audience."}
        </p>

        {!config ? (
          <p className="mt-6 text-sm text-muted-foreground">{t ? "טוען…" : "Loading…"}</p>
        ) : !config.connected ? (
          <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {t
              ? "החנות אינה מחוברת לMeta Ads. חברו אותה תחילה דרך ההגדרות."
              : "Store is not connected to Meta Ads. Connect it via Settings first."}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4 text-sm">
            <label className="block">
              <span className="font-medium">Facebook Page</span>
              <select
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                required
              >
                <option value="">{t ? "בחרו דף…" : "Pick a page…"}</option>
                {config.pages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {config.errors?.pages ? (
                <span className="mt-1 block text-xs text-rose-600">{config.errors.pages}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="font-medium">Meta Pixel</span>
              <select
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                required
              >
                <option value="">{t ? "בחרו פיקסל…" : "Pick a pixel…"}</option>
                {config.pixels.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {config.errors?.pixels ? (
                <span className="mt-1 block text-xs text-rose-600">{config.errors.pixels}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="font-medium">{t ? "כתובת יעד" : "Landing URL"}</span>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://yourstore.com/products/xyz"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                required
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="block col-span-3">
                <span className="font-medium">{t ? "מדינות (קודי ISO, מופרדים בפסיק)" : "Countries (ISO codes, comma)"}</span>
                <input
                  type="text"
                  value={countries}
                  onChange={(e) => setCountries(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono"
                />
              </label>
              <label className="block">
                <span className="font-medium">{t ? "גיל מינימלי" : "Age min"}</span>
                <input
                  type="number"
                  min={13}
                  max={64}
                  value={ageMin}
                  onChange={(e) => setAgeMin(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="font-medium">{t ? "גיל מקסימלי" : "Age max"}</span>
                <input
                  type="number"
                  min={14}
                  max={65}
                  value={ageMax}
                  onChange={(e) => setAgeMax(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
            </div>

            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                {t ? "ביטול" : "Cancel"}
              </Button>
              <Button type="submit" disabled={submitting || !pageId || !pixelId || !linkUrl}>
                {submitting ? (t ? "מפרסם…" : "Publishing…") : t ? "פרסמו את הספרינט" : "Publish sprint"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
