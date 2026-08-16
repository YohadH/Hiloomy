"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n";

export function LanguageSwitcher({
  locale,
  labels
}: {
  locale: AppLocale;
  labels: {
    english: string;
    hebrew: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function updateLocale(nextLocale: AppLocale) {
    setError(null);

    const response = await fetch("/api/settings/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: nextLocale })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? "Failed to update language.");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant={locale === "en" ? "default" : "secondary"}
          disabled={isPending}
          onClick={() => updateLocale("en")}
        >
          {labels.english}
        </Button>
        <Button
          variant={locale === "he" ? "default" : "secondary"}
          disabled={isPending}
          onClick={() => updateLocale("he")}
        >
          {labels.hebrew}
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
