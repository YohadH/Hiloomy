"use client";

import { useCallback, useEffect, useState } from "react";
import { Radar, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Competitor {
  id: string;
  name: string;
  domain: string;
  igHandle: string | null;
  status: string;
}

const MAX_ACTIVE = 5;

// Settings card for the store's tracked competitor set (max 5 active).
// Feeds the weekly report's "what did competitors do this week" section.
// Calls the /api/competitors CRUD endpoints; pure client UI because the
// server-side state is already authoritative via cookies/storeId.

export function CompetitorSetManager({ isHe }: { isHe: boolean }) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [igHandle, setIgHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const resp = await fetch("/api/competitors", { cache: "no-store" });
      const body = await resp.json();
      if (!resp.ok || !body?.ok) throw new Error(body?.error ?? "Failed to load.");
      setCompetitors(body.competitors ?? []);
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
    if (!name.trim() || !domain.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          domain: domain.trim(),
          igHandle: igHandle.trim() || null
        })
      });
      const body = await resp.json();
      if (!resp.ok || !body?.ok) throw new Error(body?.error ?? "Failed to add.");
      setName("");
      setDomain("");
      setIgHandle("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    setError(null);
    try {
      const resp = await fetch(`/api/competitors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
      });
      const body = await resp.json();
      if (!resp.ok || !body?.ok) throw new Error(body?.error ?? "Failed to update.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    }
  };

  const remove = async (id: string) => {
    if (!confirm(isHe ? "להסיר את המתחרה מהמעקב?" : "Remove this competitor?")) return;
    try {
      await fetch(`/api/competitors/${id}`, { method: "DELETE" });
      await load();
    } catch {
      /* ignore — load() will surface any error */
    }
  };

  const activeCount = competitors.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Radar className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
        <p className="text-sm font-semibold">{isHe ? "המתחרים שלי" : "My competitors"}</p>
        <span className="text-[11px] text-muted-foreground">
          {activeCount}/{MAX_ACTIVE}
        </span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {isHe
          ? "עד 5 מתחרים במעקב. המערכת אוספת אוטומטית נתוני מבצעים והנחות שלהם, והדוח השבועי כולל מדור \"מה המתחרים עשו השבוע\"."
          : "Track up to 5 competitors. Promo and discount signals are collected automatically and appear in the weekly report's competitors section."}
      </p>

      <div className="space-y-2 rounded-xl border border-border bg-background/70 p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isHe ? "שם המותג" : "Brand name"}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
          />
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={isHe ? "דומיין (rival.co.il)" : "Domain (rival.com)"}
            dir="ltr"
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
          />
          <input
            type="text"
            value={igHandle}
            onChange={(e) => setIgHandle(e.target.value)}
            placeholder={isHe ? "אינסטגרם (אופציונלי)" : "Instagram (optional)"}
            dir="ltr"
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
          />
          <Button
            type="button"
            size="sm"
            onClick={add}
            disabled={submitting || !name.trim() || !domain.trim()}
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
      ) : competitors.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isHe
            ? "עוד לא הוגדרו מתחרים. הוסיפו 3–5 מתחרים כדי להפעיל את המדור בדוח."
            : "No competitors yet. Add 3–5 to activate the report section."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {competitors.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={c.status === "active"}
                onChange={(e) => toggle(c.id, e.target.checked)}
                title={isHe ? "פעיל" : "Active"}
                className="h-4 w-4"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className={`truncate text-sm ${c.status === "active" ? "" : "text-muted-foreground line-through"}`}
                >
                  {c.name}
                </span>
                <span className="truncate text-[11px] text-muted-foreground" dir="ltr">
                  {c.domain}
                  {c.igHandle ? ` · @${c.igHandle}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => remove(c.id)}
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
