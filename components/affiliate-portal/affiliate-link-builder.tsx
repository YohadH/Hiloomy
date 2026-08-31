"use client";

// Short tracked-link composer (owner request 2026-08-26). Assembles the
// hiloomy.com/r/{slug}/{code} link — which counts the click, sets the
// 30-day cookie, and optionally auto-applies a coupon — with editable UTM
// parameters. Pure client-side string building; the heavy lifting lives in
// app/r/[slug]/[code]/route.ts.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

interface AffiliateOption {
  id: string;
  firstName: string;
  lastName: string;
  affiliateCode: string;
}

interface CouponOption {
  code: string;
  affiliateId: string;
}

export function TrackedLinkComposer({
  baseUrl,
  slug,
  affiliates,
  coupons,
  locale = "he"
}: {
  baseUrl: string;
  slug: string | null;
  affiliates: AffiliateOption[];
  coupons: CouponOption[];
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const [affiliateId, setAffiliateId] = useState(affiliates[0]?.id ?? "");
  const [couponCode, setCouponCode] = useState("");
  const [destination, setDestination] = useState("/");
  const [utmSource, setUtmSource] = useState("instagram");
  const [utmMedium, setUtmMedium] = useState("bio");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [storeShortUrl, setStoreShortUrl] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);

  const affiliate = affiliates.find((item) => item.id === affiliateId) ?? affiliates[0];
  const affiliateCoupons = coupons.filter((item) => item.affiliateId === (affiliate?.id ?? ""));

  const generatedLink = useMemo(() => {
    if (!slug || !affiliate) return "";
    const params = new URLSearchParams();
    if (couponCode) params.set("coupon", couponCode);
    const path = destination.trim();
    if (path && path !== "/") params.set("to", path.startsWith("/") ? path : `/${path}`);
    if (utmSource.trim()) params.set("utm_source", utmSource.trim());
    if (utmMedium.trim()) params.set("utm_medium", utmMedium.trim());
    if (utmCampaign.trim()) params.set("utm_campaign", utmCampaign.trim());
    const query = params.toString();
    return `${baseUrl}/r/${slug}/${encodeURIComponent(affiliate.affiliateCode)}${query ? `?${query}` : ""}`;
  }, [affiliate, baseUrl, couponCode, destination, slug, utmCampaign, utmMedium, utmSource]);

  // A minted short link is a snapshot of the fields — editing any field
  // makes it stale, so drop it and show the live preview again.
  useEffect(() => {
    setShortUrl(null);
    setStoreShortUrl(null);
  }, [generatedLink]);

  async function handleCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setMessage(lang("הקישור הועתק ללוח.", "The link was copied to the clipboard."));
    } catch {
      setMessage(lang("לא ניתן להעתיק — העתיקו ידנית.", "Could not copy — please copy manually."));
    }
  }

  async function handleMintShortLink() {
    if (!affiliate || minting) return;
    setMinting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/affiliate-portal/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliateId: affiliate.id,
          couponCode: couponCode || null,
          destinationPath: destination,
          utmSource,
          utmMedium,
          utmCampaign
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok || !body?.url) {
        throw new Error(body?.error ?? lang("יצירת הקישור נכשלה.", "Could not create the short link."));
      }
      setShortUrl(body.url);
      setStoreShortUrl(body.storeUrl ?? null);
      try {
        await navigator.clipboard.writeText(body.url);
        setMessage(lang("הקישור הקצר נוצר והועתק ללוח.", "Short link created and copied to the clipboard."));
      } catch {
        setMessage(lang("הקישור הקצר נוצר — העתיקו אותו.", "Short link created — copy it below."));
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : lang("יצירת הקישור נכשלה.", "Could not create the short link.")
      );
    } finally {
      setMinting(false);
    }
  }

  if (!slug) {
    return (
      <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
        {lang(
          "כדי להנפיק קישורים מקוצרים צריך קודם להגדיר כתובת מותג (slug) בהגדרות הפורטל.",
          "Set the program's signup slug in the portal settings to start issuing short links."
        )}{" "}
        <a href="/affiliate-portal/settings" className="font-medium text-primary underline">
          {lang("להגדרות ←", "Go to settings →")}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
      <div>
        <h3 className="text-sm font-semibold">
          {lang("קישור מקוצר לשיתוף", "Short share link")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {lang(
            "הקישור סופר את הקליק, שומר ייחוס ל־30 יום, ומחיל את הקופון שנבחר אוטומטית.",
            "The link counts the click, keeps 30-day attribution, and auto-applies the selected coupon."
          )}
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{lang("שותף/ה", "Affiliate")}</span>
          <select
            value={affiliateId}
            onChange={(event) => {
              setAffiliateId(event.target.value);
              setCouponCode("");
            }}
            aria-label={lang("בחירת שותפה", "Select affiliate")}
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          >
            {affiliates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.firstName} {item.lastName} · {item.affiliateCode}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{lang("קופון (אופציונלי)", "Coupon (optional)")}</span>
          <select
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value)}
            aria-label={lang("בחירת קופון", "Select coupon")}
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          >
            <option value="">{lang("ללא קופון", "No coupon")}</option>
            {affiliateCoupons.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{lang("נתיב יעד בחנות", "Destination path")}</span>
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="/products/example"
            dir="ltr"
            aria-label={lang("נתיב יעד בחנות", "Destination path in the store")}
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
        </label>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">utm_source</span>
          <input
            value={utmSource}
            onChange={(event) => setUtmSource(event.target.value)}
            placeholder="instagram"
            dir="ltr"
            aria-label="utm_source"
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">utm_medium</span>
          <input
            value={utmMedium}
            onChange={(event) => setUtmMedium(event.target.value)}
            placeholder="bio / story / reel"
            dir="ltr"
            aria-label="utm_medium"
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">utm_campaign</span>
          <input
            value={utmCampaign}
            onChange={(event) => setUtmCampaign(event.target.value)}
            placeholder={lang("למשל summer-launch", "e.g. summer-launch")}
            dir="ltr"
            aria-label="utm_campaign"
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
        </label>
      </div>

      {shortUrl ? (
        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            <span className="text-muted-foreground">{lang("הקישור הקצר (hiloomy.com)", "Short link (hiloomy.com)")}</span>
            <div dir="ltr" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 break-all dark:border-emerald-800 dark:bg-emerald-950/40">
              {shortUrl}
            </div>
          </div>
          {storeShortUrl && storeShortUrl !== shortUrl ? (
            <div className="space-y-2">
              <span className="text-muted-foreground">
                {lang("קישור על דומיין החנות", "On the store's own domain")}
              </span>
              <div dir="ltr" className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium leading-6 break-all">
                {storeShortUrl}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {lang(
                  "עובד רק אחרי הגדרת App Proxy באפליקציית Shopify (subpath: apps/go). עד אז השתמשו בקישור של hiloomy.com למעלה.",
                  "Works only after the Shopify app's App Proxy is set up (subpath: apps/go). Until then use the hiloomy.com link above."
                )}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <span className="text-muted-foreground">{lang("תצוגה מקדימה (הצורה הארוכה)", "Preview (long form)")}</span>
          <div dir="ltr" className="rounded-xl border border-border bg-card px-4 py-3 text-xs leading-6 break-all">
            {generatedLink}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleMintShortLink} disabled={minting || !affiliate}>
          {minting
            ? lang("יוצר קישור...", "Creating link...")
            : lang("יצירת קישור קצר", "Create short link")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleCopy(shortUrl ?? generatedLink)}
          disabled={!shortUrl && !generatedLink}
        >
          {lang("העתקת קישור", "Copy link")}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}
