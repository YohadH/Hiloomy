"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface CouponTemplate {
  id: string;
  name: string;
  discountType: string;
  value: number;
}

interface AffiliateOption {
  id: string;
  firstName: string;
  lastName: string;
  affiliateCode: string;
  couponCode?: string | null;
}

export function AffiliateLinkBuilder({
  baseStoreUrl,
  templates,
  affiliates,
  locale = "he"
}: {
  baseStoreUrl: string;
  templates: CouponTemplate[];
  affiliates: AffiliateOption[];
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const router = useRouter();
  const [affiliateId, setAffiliateId] = useState(affiliates[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [customCode, setCustomCode] = useState("");
  const [redirectPath, setRedirectPath] = useState("/");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const affiliate = affiliates.find((item) => item.id === affiliateId) ?? affiliates[0];
  const selected = templates.find((template) => template.id === templateId) ?? templates[0];
  const generatedCode = (customCode.trim() || affiliate?.couponCode || `${affiliate?.affiliateCode ?? "AFF"}${Math.round(selected?.value ?? 15)}`).toUpperCase();

  const generatedLink = useMemo(() => {
    if (!affiliate || !selected) return "";
    const params = new URLSearchParams({
      ref: affiliate.affiliateCode.toLowerCase(),
      coupon: generatedCode,
      destination: redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}` ,
      utm_source: "affiliate",
      utm_medium: "creator",
      utm_campaign: affiliate.affiliateCode.toLowerCase()
    });
    return `${baseStoreUrl.replace(/\/$/, "")}/api/affiliate-portal/redirect?${params.toString()}`;
  }, [affiliate, baseStoreUrl, generatedCode, redirectPath]);

  async function handleCreateCoupon() {
    if (!affiliate || !selected) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/affiliate-portal/coupons/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            affiliateId: affiliate.id,
            code: generatedCode,
            title: selected.name,
            discountType: selected.discountType,
            value: selected.value,
            appliesOncePerCustomer: true,
            redirectPath
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? lang("יצירת הקופון נכשלה", "Could not create the coupon."));
        }
        setMessage(
          lang(
            `הקופון ${payload.code} נוצר ב-Shopify ומוכן לשיתוף.`,
            `Coupon ${payload.code} was created in Shopify and is ready to share.`
          )
        );
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : lang("יצירת הקופון נכשלה", "Could not create the coupon.")
        );
      }
    });
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setMessage(lang("הקישור הועתק ללוח.", "The link was copied to the clipboard."));
    } catch {
      setMessage(
        lang(
          "לא ניתן להעתיק את הקישור. העתיקו אותו ידנית.",
          "Could not copy the link. Please copy it manually."
        )
      );
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
      <div className="grid gap-3 xl:grid-cols-4">
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{lang("שותפה", "Affiliate")}</span>
          <select
            value={affiliateId}
            onChange={(event) => setAffiliateId(event.target.value)}
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
          <span className="text-muted-foreground">{lang("תבנית הנחה", "Discount template")}</span>
          <select
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            aria-label={lang("בחירת תבנית הנחה", "Select discount template")}
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} · {template.discountType === "percent" ? `${template.value}%` : `₪${template.value}`}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{lang("קוד מותאם", "Custom code")}</span>
          <input
            value={customCode}
            onChange={(event) => setCustomCode(event.target.value.toUpperCase())}
            placeholder={generatedCode}
            dir="ltr"
            aria-label={lang("קוד קופון מותאם", "Custom coupon code")}
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{lang("נתיב יעד", "Destination path")}</span>
          <input
            value={redirectPath}
            onChange={(event) => setRedirectPath(event.target.value || "/")}
            placeholder="/"
            dir="ltr"
            aria-label={lang("נתיב יעד בחנות", "Destination path in the store")}
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
        </label>
      </div>

      <div className="space-y-2 text-sm">
        <span className="text-muted-foreground">
          {lang("קישור הפניה שמחיל את הקופון אוטומטית", "Referral link that applies the coupon automatically")}
        </span>
        <div dir="ltr" className="rounded-xl border border-border bg-card px-4 py-3 text-xs leading-6 break-all">{generatedLink}</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={handleCreateCoupon} disabled={isPending || !affiliate || !selected}>
          {isPending
            ? lang("יוצר קופון...", "Creating coupon...")
            : lang("הפקת קופון והפעלה ב-Shopify", "Create coupon and activate in Shopify")}
        </Button>
        <Button type="button" variant="secondary" onClick={handleCopyLink} disabled={!generatedLink}>
          {lang("העתקת קישור", "Copy link")}
        </Button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
