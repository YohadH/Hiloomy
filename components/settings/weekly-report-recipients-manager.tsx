"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Recipient {
  id: string;
  email: string;
  displayName: string | null;
  active: boolean;
}

// Settings card for managing the weekly report email recipients.
// Calls the /api/weekly-summary/recipients CRUD endpoints; pure client UI
// because the server-side state is already authoritative via cookies/storeId.

export function WeeklyReportRecipientsManager({
  isHe
}: {
  isHe: boolean;
}) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const resp = await fetch("/api/weekly-summary/recipients", { cache: "no-store" });
      const body = await resp.json();
      if (!resp.ok || !body?.ok) throw new Error(body?.error ?? "Failed to load.");
      setRecipients(body.recipients ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/api/weekly-summary/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), displayName: displayName.trim() || null })
      });
      const body = await resp.json();
      if (!resp.ok || !body?.ok) throw new Error(body?.error ?? "Failed to add.");
      setEmail("");
      setDisplayName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    try {
      await fetch(`/api/weekly-summary/recipients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
      });
      await load();
    } catch {
      /* ignore — load() will surface any error */
    }
  };

  const remove = async (id: string) => {
    if (!confirm(isHe ? "להסיר את הנמען?" : "Remove this recipient?")) return;
    try {
      await fetch(`/api/weekly-summary/recipients/${id}`, { method: "DELETE" });
      await load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
        <p className="text-sm font-semibold">
          {isHe ? "נמענים לדוח השבועי" : "Weekly report recipients"}
        </p>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {isHe
          ? "כל הנמענים הפעילים יקבלו את הדוח האוטומטי כל יום ראשון בשעה 09:00 בשעון ירושלים, ואת דוח החודש בסוף החודש."
          : "Every active recipient receives the auto-generated report on Sundays at 09:00 Asia/Jerusalem, plus the monthly rollup at month-end."}
      </p>

      <div className="space-y-2 rounded-xl border border-border bg-background/70 p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={isHe ? "כתובת אימייל" : "Email"}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
          />
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={isHe ? "שם (אופציונלי)" : "Name (optional)"}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
          />
          <Button
            type="button"
            size="sm"
            onClick={add}
            disabled={submitting || !email.trim()}
            className="inline-flex items-center gap-1.5"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {isHe ? "הוסיפו" : "Add"}
          </Button>
        </div>
        {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">
          <Loader2 className="ms-0 me-1.5 inline h-3 w-3 animate-spin" />
          {isHe ? "טוען…" : "Loading…"}
        </p>
      ) : recipients.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isHe ? "אין נמענים מוגדרים." : "No recipients configured yet."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {recipients.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={r.active}
                onChange={(e) => toggle(r.id, e.target.checked)}
                title={isHe ? "פעיל" : "Active"}
                className="h-4 w-4"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate text-sm ${r.active ? "" : "text-muted-foreground line-through"}`}>
                  {r.email}
                </span>
                {r.displayName ? (
                  <span className="truncate text-[11px] text-muted-foreground">{r.displayName}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(r.id)}
                className="rounded-md p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
                title={isHe ? "הסרה" : "Remove"}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
