"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function OrganizationSettingsForm({
  initialName,
  initialSlug,
  initialCurrency,
  initialLocale,
  initialBillingCountry,
  canEdit,
  viewerLocale
}: {
  initialName: string;
  initialSlug: string;
  initialCurrency: string;
  initialLocale: "he" | "en";
  initialBillingCountry: string;
  canEdit: boolean;
  viewerLocale: "he" | "en";
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [currency, setCurrency] = useState(initialCurrency);
  const [billingCountry, setBillingCountry] = useState(initialBillingCountry);
  const [locale, setLocale] = useState<"he" | "en">(initialLocale);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t =
    viewerLocale === "he"
      ? {
          name: "שם החברה",
          slug: "מזהה URL",
          currency: "מטבע חיוב",
          country: "מדינת חיוב",
          orgLocale: "שפת ברירת מחדל לדוחות",
          save: "שמרו שינויים",
          saving: "שומר…",
          savedMsg: "השינויים נשמרו."
        }
      : {
          name: "Organization name",
          slug: "URL slug",
          currency: "Billing currency",
          country: "Billing country",
          orgLocale: "Default locale for reports",
          save: "Save changes",
          saving: "Saving…",
          savedMsg: "Changes saved."
        };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/settings/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, currency, billingCountry, locale })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed to save.");
      setSavedMsg(t.savedMsg);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      dir={viewerLocale === "he" ? "rtl" : "ltr"}
      className="space-y-5 rounded-2xl border border-border bg-card p-6"
    >
      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t.name}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:bg-muted/40 disabled:cursor-not-allowed"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t.slug}
        </span>
        <input
          type="text"
          value={initialSlug}
          disabled
          className="mt-1 w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-mono cursor-not-allowed"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.currency}
          </span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={!canEdit}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:bg-muted/40"
          >
            <option value="ILS">ILS — ₪ Israeli Shekel</option>
            <option value="USD">USD — $ US Dollar</option>
            <option value="EUR">EUR — € Euro</option>
            <option value="GBP">GBP — £ British Pound</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.country}
          </span>
          <input
            type="text"
            value={billingCountry}
            onChange={(e) => setBillingCountry(e.target.value.toUpperCase().slice(0, 2))}
            disabled={!canEdit}
            placeholder="IL"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono disabled:bg-muted/40"
          />
        </label>
      </div>

      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t.orgLocale}
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => canEdit && setLocale("he")}
            disabled={!canEdit}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              locale === "he"
                ? "border-violet-500 bg-violet-50 text-violet-900"
                : "border-border bg-background hover:bg-muted/60"
            } disabled:cursor-not-allowed`}
          >
            עברית
          </button>
          <button
            type="button"
            onClick={() => canEdit && setLocale("en")}
            disabled={!canEdit}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              locale === "en"
                ? "border-violet-500 bg-violet-50 text-violet-900"
                : "border-border bg-background hover:bg-muted/60"
            } disabled:cursor-not-allowed`}
          >
            English
          </button>
        </div>
      </div>

      {savedMsg ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          ✓ {savedMsg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          ⚠ {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !canEdit}
        className="inline-flex items-center gap-2 rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {saving ? t.saving : t.save}
      </button>
    </div>
  );
}
