"use client";

import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type NoticeTone = "success" | "error" | "info";

const INITIAL_FORM = {
  email: "",
  firstName: "",
  lastName: "",
  country: "",
  source: "Manual",
  status: "approved",
  affiliateCode: "",
  couponCode: "",
  instagramProfileUrl: "",
  programName: ""
};

function getNoticeClasses(tone: NoticeTone) {
  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-border bg-card text-muted-foreground";
}

export function AffiliateDirectoryActions({ locale = "he" }: { locale?: "he" | "en" } = {}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateField(field: keyof typeof INITIAL_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(INITIAL_FORM);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleExportClick() {
    window.location.assign("/api/affiliate-portal/affiliates/export?format=csv");
  }

  async function handleImportChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setNotice({ tone: "info", text: lang(`מייבא את ${file.name}...`, `Importing ${file.name}...`) });

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/affiliate-portal/affiliates/import", {
          method: "POST",
          body: formData
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? lang("הייבוא נכשל.", "Import failed."));
        }

        const counts = lang(
          `נוצרו ${payload.created}, עודכנו ${payload.updated}, דולגו ${payload.skipped}.`,
          `Created ${payload.created}, updated ${payload.updated}, skipped ${payload.skipped}.`
        );
        const programs = payload.programsCreated
          ? lang(
              ` נוצר${payload.programsCreated === 1 ? "ה" : "ו"} ${payload.programsCreated} ${payload.programsCreated === 1 ? "תוכנית" : "תוכניות"}.`,
              ` Created ${payload.programsCreated} program${payload.programsCreated === 1 ? "" : "s"}.`
            )
          : "";
        const errors = Array.isArray(payload.errors) && payload.errors.length
          ? ` ${payload.errors.slice(0, 3).join(" ")}`
          : "";

        setNotice({
          tone: Array.isArray(payload.errors) && payload.errors.length ? "info" : "success",
          text: lang(
            `הקובץ ${file.name} יובא. ${counts}${programs}${errors}`,
            `Imported ${file.name}. ${counts}${programs}${errors}`
          )
        });
        router.refresh();
      } catch (error) {
        setNotice({
          tone: "error",
          text: error instanceof Error ? error.message : lang("הייבוא נכשל.", "Import failed.")
        });
      } finally {
        input.value = "";
      }
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/affiliate-portal/affiliates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? lang("לא ניתן היה לשמור את השותפה.", "Could not save the affiliate."));
        }

        setNotice({
          tone: "success",
          text: payload.created
            ? lang("השותפה נוצרה בהצלחה.", "Affiliate created successfully.")
            : lang("השותפה עודכנה בהצלחה.", "Affiliate updated successfully.")
        });
        resetForm();
        setIsFormOpen(false);
        router.refresh();
      } catch (error) {
        setNotice({
          tone: "error",
          text: error instanceof Error
            ? error.message
            : lang("לא ניתן היה לשמור את השותפה.", "Could not save the affiliate.")
        });
      }
    });
  }

  return (
    <div className="w-full max-w-3xl space-y-3 lg:w-auto">
      <div className="flex flex-wrap gap-3 lg:justify-end">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.json,application/json,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleImportChange}
          aria-label={lang("בחירת קובץ לייבוא", "Choose a file to import")}
        />
        <Button type="button" variant="secondary" onClick={handleImportClick} disabled={isPending}>
          {isPending ? lang("בעבודה...", "Working...") : lang("ייבוא", "Import")}
        </Button>
        <Button type="button" variant="secondary" onClick={handleExportClick} disabled={isPending}>
          {lang("ייצוא", "Export")}
        </Button>
        <Button type="button" onClick={() => setIsFormOpen((value) => !value)} disabled={isPending}>
          {isFormOpen ? lang("סגירת הטופס", "Close form") : lang("הוספת שותפה", "Add affiliate")}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground lg:text-end">
        {lang(
          "הייבוא תומך בקבצי Excel‏ (.xlsx, .xls), CSV ו-JSON.",
          "Import supports Excel (.xlsx, .xls), CSV, and JSON files."
        )}
      </p>

      {isFormOpen ? (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{lang("אימייל", "Email")}</span>
              <input
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
                type="email"
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{lang("שם פרטי", "First name")}</span>
              <input
                value={form.firstName}
                onChange={(event) => updateField("firstName", event.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{lang("שם משפחה", "Last name")}</span>
              <input
                value={form.lastName}
                onChange={(event) => updateField("lastName", event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{lang("מדינה", "Country")}</span>
              <input
                value={form.country}
                onChange={(event) => updateField("country", event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{lang("מקור", "Source")}</span>
              <input
                value={form.source}
                onChange={(event) => updateField("source", event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{lang("סטטוס", "Status")}</span>
              <select
                value={form.status}
                onChange={(event) => updateField("status", event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              >
                <option value="approved">{lang("מאושרת", "Approved")}</option>
                <option value="pending">{lang("ממתינה", "Pending")}</option>
                <option value="denied">{lang("נדחתה", "Denied")}</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{lang("קוד שותפה", "Affiliate code")}</span>
              <input
                value={form.affiliateCode}
                onChange={(event) => updateField("affiliateCode", event.target.value)}
                placeholder={lang("אופציונלי", "Optional")}
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{lang("קוד קופון", "Coupon code")}</span>
              <input
                value={form.couponCode}
                onChange={(event) => updateField("couponCode", event.target.value)}
                placeholder={lang("אופציונלי", "Optional")}
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{lang("פרופיל אינסטגרם", "Instagram profile")}</span>
              <input
                value={form.instagramProfileUrl}
                onChange={(event) => updateField("instagramProfileUrl", event.target.value)}
                placeholder={lang(
                  "@handle או https://www.instagram.com/handle/",
                  "@handle or https://www.instagram.com/handle/"
                )}
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">{lang("שם התוכנית", "Program name")}</span>
            <input
              value={form.programName}
              onChange={(event) => updateField("programName", event.target.value)}
              placeholder={lang("אופציונלי", "Optional")}
              className="w-full rounded-xl border border-border bg-background px-4 py-3"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? lang("שומר...", "Saving...") : lang("שמירת שותפה", "Save affiliate")}
            </Button>
            <Button type="button" variant="ghost" onClick={resetForm} disabled={isPending}>
              {lang("איפוס", "Reset")}
            </Button>
          </div>
        </form>
      ) : null}

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${getNoticeClasses(notice.tone)}`}>
          {notice.text}
        </div>
      ) : null}
    </div>
  );
}
