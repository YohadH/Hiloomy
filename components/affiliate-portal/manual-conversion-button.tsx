"use client";

// Manual conversion entry — for the "operator knows an order is affiliate-
// driven but BixGrow never delivered it" case. Small dialog form; on
// success shows a toast and refreshes the conversions table.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type Locale = "he" | "en";

interface FormState {
  affiliateEmail: string;
  affiliateCode: string;
  orderNumber: string;
  salesAmount: string;
  commissionAmount: string;
  couponCode: string;
  sourceUrl: string;
  contentTitle: string;
  occurredAt: string;
  note: string;
}

const EMPTY: FormState = {
  affiliateEmail: "",
  affiliateCode: "",
  orderNumber: "",
  salesAmount: "",
  commissionAmount: "",
  couponCode: "",
  sourceUrl: "",
  contentTitle: "",
  occurredAt: "",
  note: ""
};

function labels(locale: Locale) {
  const isHe = locale === "he";
  return {
    trigger: isHe ? "הוספת המרה ידנית" : "Add conversion manually",
    dialogTitle: isHe ? "הוספת המרה ידנית" : "Add a conversion manually",
    dialogHint: isHe
      ? "השתמשו בזה כשעסקה מיוחסת לשותף/ה אבל לא הגיעה דרך הסנכרון האוטומטי (BixGrow / Shopify)."
      : "Use this when a sale is affiliate-driven but never came through the automated sync (BixGrow / Shopify).",
    identifySection: isHe ? "זיהוי השותף/ה" : "Identify the affiliate",
    identifyHint: isHe
      ? "הזינו אימייל או קוד שותף — לפחות אחד. אימייל עדיף כי הוא ייחודי."
      : "Provide email or affiliate code — at least one. Email is safer (more unique).",
    email: isHe ? "אימייל" : "Email",
    affiliateCode: isHe ? "קוד שותף" : "Affiliate code",
    orderSection: isHe ? "פרטי ההזמנה" : "Order details",
    orderNumber: isHe ? "מספר הזמנה" : "Order number",
    orderHint: isHe ? "לדוגמה 31701 או ‎#31701" : "e.g. 31701 or #31701",
    total: isHe ? "סכום העסקה" : "Sales amount",
    commission: isHe ? "עמלה (לא חובה)" : "Commission (optional)",
    commissionHint: isHe
      ? "אם לא ממלאים, מחושב אוטומטית לפי תעריף השותף/ה או התוכנית."
      : "Leave blank to auto-compute from the affiliate's rate or program default.",
    couponCode: isHe ? "קוד קופון" : "Coupon code",
    sourceUrl: isHe ? "כתובת מקור" : "Source URL",
    contentTitle: isHe ? "שם התוכן / הפוסט" : "Content / post title",
    occurredAt: isHe ? "מועד העסקה" : "When it happened",
    occurredAtHint: isHe ? "אם ריק — עכשיו" : "Blank = now",
    note: isHe ? "הערה פנימית" : "Internal note",
    cancel: isHe ? "ביטול" : "Cancel",
    submit: isHe ? "הוספת המרה" : "Add conversion",
    submitting: isHe ? "מוסיף…" : "Adding…",
    successToast: (num: string) =>
      isHe ? `נוספה המרה להזמנה ${num}` : `Added conversion for order ${num}`,
    errorFallback: isHe ? "ההוספה נכשלה" : "Add failed"
  };
}

export function ManualConversionButton({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = labels(locale);
  const isHe = locale === "he";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const canSubmit =
    !!form.orderNumber.trim() &&
    !!form.salesAmount.trim() &&
    (!!form.affiliateEmail.trim() || !!form.affiliateCode.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/affiliate-portal/conversions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliateEmail: form.affiliateEmail.trim() || undefined,
          affiliateCode: form.affiliateCode.trim() || undefined,
          orderNumber: form.orderNumber.trim(),
          salesAmount: form.salesAmount.trim(),
          commissionAmount: form.commissionAmount.trim() || undefined,
          couponCode: form.couponCode.trim() || undefined,
          sourceUrl: form.sourceUrl.trim() || undefined,
          contentTitle: form.contentTitle.trim() || undefined,
          occurredAt: form.occurredAt.trim() || undefined,
          note: form.note.trim() || undefined
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success(t.successToast(form.orderNumber.trim()));
      setForm(EMPTY);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err, { fallback: t.errorFallback });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(buttonVariants({ variant: "default" }), "gap-2")}
      >
        <PlusCircle className="h-4 w-4" aria-hidden />
        {t.trigger}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 sm:items-center"
          onClick={() => !submitting && setOpen(false)}
          dir={isHe ? "rtl" : "ltr"}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
          >
            <header className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">{t.dialogTitle}</h2>
              <p className="text-sm text-slate-600">{t.dialogHint}</p>
            </header>

            <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.identifySection}
              </legend>
              <p className="text-xs text-slate-500">{t.identifyHint}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  {t.email}
                  <input
                    type="email"
                    value={form.affiliateEmail}
                    onChange={(e) => update("affiliateEmail", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  {t.affiliateCode}
                  <input
                    type="text"
                    value={form.affiliateCode}
                    onChange={(e) => update("affiliateCode", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-normal text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.orderSection}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  {t.orderNumber}
                  <input
                    required
                    type="text"
                    placeholder={t.orderHint}
                    value={form.orderNumber}
                    onChange={(e) => update("orderNumber", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  {t.total}
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.salesAmount}
                    onChange={(e) => update("salesAmount", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  {t.commission}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.commissionAmount}
                    onChange={(e) => update("commissionAmount", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                  <span className="text-[10px] font-normal text-slate-500">{t.commissionHint}</span>
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  {t.couponCode}
                  <input
                    type="text"
                    value={form.couponCode}
                    onChange={(e) => update("couponCode", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-normal uppercase text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-700 sm:col-span-2">
                  {t.contentTitle}
                  <input
                    type="text"
                    value={form.contentTitle}
                    onChange={(e) => update("contentTitle", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-700 sm:col-span-2">
                  {t.sourceUrl}
                  <input
                    type="url"
                    value={form.sourceUrl}
                    onChange={(e) => update("sourceUrl", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  {t.occurredAt}
                  <input
                    type="datetime-local"
                    value={form.occurredAt}
                    onChange={(e) => update("occurredAt", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                  <span className="text-[10px] font-normal text-slate-500">{t.occurredAtHint}</span>
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-700 sm:col-span-2">
                  {t.note}
                  <input
                    type="text"
                    value={form.note}
                    onChange={(e) => update("note", e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className={cn(buttonVariants({ variant: "secondary" }))}
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className={cn(buttonVariants({ variant: "default" }), "gap-2")}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? t.submitting : t.submit}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
