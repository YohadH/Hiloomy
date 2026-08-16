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
  affiliates
}: {
  baseStoreUrl: string;
  templates: CouponTemplate[];
  affiliates: AffiliateOption[];
}) {
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
          throw new Error(payload.error ?? "יצירת הקופון נכשלה");
        }
        setMessage(`הקופון ${payload.code} נוצר בShopify ומוכן לשיתוף.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "יצירת הקופון נכשלה");
      }
    });
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setMessage("הקישור הועתק ללוח.");
    } catch {
      setMessage("לא ניתן להעתיק את הקישור. העתיקו אותו ידנית.");
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
      <div className="grid gap-3 xl:grid-cols-4">
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">שותף</span>
          <select
            value={affiliateId}
            onChange={(event) => setAffiliateId(event.target.value)}
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
          <span className="text-muted-foreground">תבנית הנחה</span>
          <select
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
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
          <span className="text-muted-foreground">קוד מותאם</span>
          <input
            value={customCode}
            onChange={(event) => setCustomCode(event.target.value.toUpperCase())}
            placeholder={generatedCode}
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">נתיב יעד</span>
          <input
            value={redirectPath}
            onChange={(event) => setRedirectPath(event.target.value || "/")}
            placeholder="/"
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
        </label>
      </div>

      <div className="space-y-2 text-sm">
        <span className="text-muted-foreground">קישור שמחיל את הקופון אוטומטית</span>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs leading-6 break-all">{generatedLink}</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={handleCreateCoupon} disabled={isPending || !affiliate || !selected}>
          {isPending ? "יוצר קופון..." : "צרו קופון והפעילו בShopify"}
        </Button>
        <Button type="button" variant="secondary" onClick={handleCopyLink} disabled={!generatedLink}>
          העתקת קישור
        </Button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
