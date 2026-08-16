"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Globe, User as UserIcon } from "lucide-react";

export function AccountSettingsForm({
  initialEmail,
  initialDisplayName,
  initialLocale
}: {
  initialEmail: string;
  initialDisplayName: string;
  initialLocale: "he" | "en";
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<"he" | "en">(initialLocale);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t = locale === "he"
    ? {
        email: "אימייל",
        displayName: "שם תצוגה",
        displayNameHint: "שם זה יוצג בדוחות ובאימיילים שלכם",
        language: "שפת ממשק",
        hebrew: "עברית",
        english: "English",
        save: "שמרו שינויים",
        saving: "שומר…",
        savedMsg: "ההגדרות נשמרו.",
        emailHidden: "האימייל לא ניתן לשינוי. צרו קשר אם אתם צריכים לעדכן אותו."
      }
    : {
        email: "Email",
        displayName: "Display name",
        displayNameHint: "Shown in your reports and emails",
        language: "Interface language",
        hebrew: "עברית",
        english: "English",
        save: "Save changes",
        saving: "Saving…",
        savedMsg: "Settings saved.",
        emailHidden: "Email can't be changed here. Contact support if you need to update it."
      };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/settings/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, locale })
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
    <div dir={locale === "he" ? "rtl" : "ltr"} className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t.email}
        </span>
        <input
          type="email"
          value={initialEmail}
          disabled
          className="mt-1 w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm cursor-not-allowed"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t.emailHidden}</p>
      </label>

      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <UserIcon className="me-1 inline h-3 w-3" aria-hidden />
          {t.displayName}
        </span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t.displayNameHint}</p>
      </label>

      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Globe className="me-1 inline h-3 w-3" aria-hidden />
          {t.language}
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setLocale("he")}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              locale === "he"
                ? "border-violet-500 bg-violet-50 text-violet-900"
                : "border-border bg-background hover:bg-muted/60"
            }`}
          >
            {t.hebrew}
          </button>
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              locale === "en"
                ? "border-violet-500 bg-violet-50 text-violet-900"
                : "border-border bg-background hover:bg-muted/60"
            }`}
          >
            {t.english}
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
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {saving ? t.saving : t.save}
      </button>
    </div>
  );
}
