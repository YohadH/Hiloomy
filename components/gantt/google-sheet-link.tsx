"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// "Link a Google Sheet": paste the sheet's link → pick the tab → link. The
// tab is parsed with the same parser as an upload and re-synced by the
// cron, so edits in the sheet show up here as changes. Needs the store's
// Google Sheets connection (read-only scope); offers it inline when missing.
export function GoogleSheetLink({
  storeId,
  connected,
  locale,
  onLinked
}: {
  storeId: string;
  connected: boolean;
  locale: "he" | "en";
  onLinked: (sheetId: string) => void;
}) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [tabs, setTabs] = useState<Array<{ title: string; gid: number; rows: number }> | null>(null);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>("");
  const [tab, setTab] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTabs() {
    setBusy(true);
    setError(null);
    setTabs(null);
    try {
      const res = await fetch(`/api/gantt/google/tabs?ref=${encodeURIComponent(ref)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body?.error ?? t("לא ניתן לקרוא את הגיליון.", "Could not read the spreadsheet."));
      setTabs(body.tabs);
      setSpreadsheetTitle(body.title ?? "");
      setTab(body.tabs?.[0]?.title ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function link() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gantt/google/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, sheetName: tab })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body?.error ?? t("הקישור נכשל.", "Linking failed."));
      setOpen(false);
      setRef("");
      setTabs(null);
      onLinked(body.sheetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Link2 className="me-1.5 h-4 w-4" aria-hidden />
        {t("לקשר Google Sheet", "Link a Google Sheet")}
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{t("קישור לגיליון Google", "Link a Google Sheet")}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              "הילומי קוראת את הלשונית שתבחרו (קריאה בלבד) ובודקת שינויים בכל סנכרון. עריכות בגיליון יופיעו כאן כ״מה השתנה בתוכנית״.",
              "Hiloomy reads the tab you pick (read-only) and checks for changes on every sync. Edits in the sheet show up here as \"what changed in the plan\"."
            )}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          {t("ביטול", "Cancel")}
        </button>
      </div>

      {!connected ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">{t("קודם מחברים את חשבון Google שיש לו גישה לגיליון.", "First connect the Google account that can open the sheet.")}</p>
          <Button size="sm" onClick={() => (window.location.href = `/api/google-sheets/oauth/start?storeId=${encodeURIComponent(storeId)}`)}>
            {t("חיבור Google Sheets", "Connect Google Sheets")}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              dir="ltr"
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
            />
            <Button size="sm" variant="secondary" onClick={loadTabs} disabled={busy || !ref.trim()}>
              {busy && !tabs ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("טעינת לשוניות", "Load tabs")}
            </Button>
          </div>
          {tabs ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs text-muted-foreground">{spreadsheetTitle}</span>
              <select value={tab} onChange={(e) => setTab(e.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                {tabs.map((x) => (
                  <option key={x.gid} value={x.title}>
                    {x.title} · {x.rows} {t("שורות", "rows")}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={link} disabled={busy || !tab}>
                {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
                {t("לקשר את הלשונית", "Link this tab")}
              </Button>
            </div>
          ) : null}
        </>
      )}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
