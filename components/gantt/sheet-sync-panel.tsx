"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Locale = "he" | "en";

export interface LinkedSheetMeta {
  id: string;
  sourceType: string;
  sourceSheetName: string | null;
  sourceUrl: string | null;
  sourceLastSyncedAt: string | null;
  sourceSyncError: string | null;
}

interface SyncEntry {
  id: string;
  syncedAt: string;
  added: number;
  removed: number;
  changed: number;
  detailsJson: {
    initial?: boolean;
    added?: Array<{ task: string; role: string | null; date: string | null }>;
    removed?: Array<{ task: string; role: string | null; date: string | null }>;
    changed?: Array<{ task: string; field: "start" | "end" | "status"; from: string | null; to: string | null }>;
  } | null;
}

function when(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === "he" ? "he-IL" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// For a Gantt linked to a Google Sheet: where it comes from, when it was last
// read, a Sync-now button, and the change log — what the team moved in the
// plan since it was linked. Uploaded sheets don't render this.
export function SheetSyncPanel({ sheet, locale, onSynced }: { sheet: LinkedSheetMeta; locale: Locale; onSynced: () => void }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [syncs, setSyncs] = useState<SyncEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(sheet.sourceSyncError);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadSyncs = useCallback(async () => {
    try {
      const res = await fetch(`/api/gantt/${sheet.id}/changes`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) setSyncs(body.syncs);
    } catch {
      // the panel still shows the source line
    }
  }, [sheet.id]);

  useEffect(() => {
    void loadSyncs();
  }, [loadSyncs]);

  async function syncNow() {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/gantt/${sheet.id}/sync`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body?.error ?? t("הסנכרון נכשל.", "Sync failed."));
      if (body.skipped) setMessage(t("אין שינויים בגיליון מאז הסנכרון הקודם.", "No changes in the sheet since the last sync."));
      else {
        const d = body.diff as { added: unknown[]; removed: unknown[]; changed: unknown[] };
        setMessage(t(`עודכן: ${d.added.length} נוספו · ${d.removed.length} הוסרו · ${d.changed.length} השתנו`, `Updated: ${d.added.length} added · ${d.removed.length} removed · ${d.changed.length} changed`));
        onSynced();
      }
      await loadSyncs();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  const history = syncs.filter((s) => !s.detailsJson?.initial);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("מקושר ל־Google Sheets", "Linked to Google Sheets")}</p>
          <p className="text-xs text-muted-foreground">
            {t("לשונית", "Tab")}: {sheet.sourceSheetName ?? "?"}
            {sheet.sourceLastSyncedAt ? ` · ${t("נקרא לאחרונה", "last read")} ${when(sheet.sourceLastSyncedAt, locale)}` : ""}
            {" · "}
            {t("מתעדכן אוטומטית כל שעתיים", "auto-refreshes every 2 hours")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sheet.sourceUrl ? (
            <a href={sheet.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-semibold hover:bg-accent sm:h-9">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t("לפתוח את הגיליון", "Open sheet")}
            </a>
          ) : null}
          <Button size="sm" onClick={syncNow} disabled={syncing}>
            {syncing ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="me-1.5 h-4 w-4" aria-hidden />}
            {t("סנכרון עכשיו", "Sync now")}
          </Button>
        </div>
      </div>
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {history.length > 0 ? (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("מה השתנה בתוכנית", "What changed in the plan")}</p>
          <ul className="mt-1 divide-y divide-border">
            {history.map((s) => {
              const d = s.detailsJson ?? {};
              const isOpen = expanded === s.id;
              return (
                <li key={s.id} className="py-2">
                  <button type="button" onClick={() => setExpanded(isOpen ? null : s.id)} className="flex w-full items-center justify-between gap-3 text-start text-sm">
                    <span className="text-muted-foreground">{when(s.syncedAt, locale)}</span>
                    <span className="font-medium">
                      {t(`${s.added} נוספו · ${s.removed} הוסרו · ${s.changed} השתנו`, `${s.added} added · ${s.removed} removed · ${s.changed} changed`)}
                    </span>
                  </button>
                  {isOpen ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {(d.added ?? []).map((a, i) => (
                        <li key={`a${i}`}>
                          <span className="font-semibold text-success">+ </span>
                          {a.task}
                          {a.date ? <span className="text-muted-foreground"> · {a.date}</span> : null}
                        </li>
                      ))}
                      {(d.removed ?? []).map((r, i) => (
                        <li key={`r${i}`}>
                          <span className="font-semibold text-danger">− </span>
                          {r.task}
                          {r.date ? <span className="text-muted-foreground"> · {r.date}</span> : null}
                        </li>
                      ))}
                      {(d.changed ?? []).map((c, i) => (
                        <li key={`c${i}`}>
                          <span className="font-semibold text-warning">~ </span>
                          {c.task}
                          <span className="text-muted-foreground">
                            {" · "}
                            {c.field === "start" ? t("התחלה", "start") : c.field === "end" ? t("סיום", "end") : t("סטטוס", "status")}: {c.from ?? "—"} → {c.to ?? "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
