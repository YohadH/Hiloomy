"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LocationRow {
  id: string;
  name: string;
  isActive: boolean;
}

// Settings → Inventory: which Shopify locations count as "stock".
// Empty selection = Shopify's total across every location (the old behaviour).
export function InventoryLocationsManager({ storeId, isHe }: { storeId: string; isHe: boolean }) {
  const t = (he: string, en: string) => (isHe ? he : en);
  const [locations, setLocations] = useState<LocationRow[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<"scope" | "unavailable" | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | "sync" | null>("load");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (refresh = false) => {
    setBusy("load");
    setError(null);
    try {
      const res = await fetch(`/api/inventory/locations?storeId=${encodeURIComponent(storeId)}${refresh ? "&refresh=1" : ""}`);
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "request failed");
      setLocations(body.locations ?? []);
      setSelected(body.selected ?? []);
      setSyncedAt(body.syncedAt ?? null);
      setScopeError(body.error ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
      setLocations([]);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const save = async () => {
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/inventory/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, locationIds: selected })
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "request failed");
      setMessage(
        selected.length === 0
          ? t("נשמר. המלאי יחושב לפי כל המיקומים (סה״כ Shopify).", "Saved. Stock is now Shopify's total across all locations.")
          : t(`נשמר. המלאי מחושב לפי ${selected.length} מיקומים; ${body.updated} וריאציות עודכנו.`, `Saved. Stock now follows ${selected.length} location(s); ${body.updated} variants updated.`)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/inventory/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, sync: true })
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "request failed");
      setMessage(t(`המלאי לפי מיקום סונכרן: ${body.levels} רשומות ב־${body.locations} מיקומים.`, `Inventory by location synced: ${body.levels} rows across ${body.locations} locations.`));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        {t(
          "בחרו אילו מיקומים ב־Shopify נחשבים \"מלאי\". התראות מלאי, מעקב מוצרים ותיבת ההחלטות יעקבו רק אחריהם. בלי בחירה — הסכום של כל המיקומים, כולל מחסן פגומים או אולם תצוגה.",
          "Choose which Shopify locations count as \"stock\". Stock alerts, product follow-ups and the Decision Inbox will follow only those. With no selection, it's Shopify's total across every location, damaged-goods shelf and showroom included."
        )}
      </p>

      {scopeError === "scope" ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          {t(
            "כדי לקרוא את שמות המיקומים צריך לאשר ל־Hiloomy הרשאת read_locations. חברו את Shopify מחדש מהמסך הזה ואז חזרו לכאן.",
            "Reading location names needs the read_locations permission. Reconnect Shopify from this screen, then come back here."
          )}
        </p>
      ) : null}

      {busy === "load" && locations === null ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("טוען מיקומים…", "Loading locations…")}
        </p>
      ) : locations && locations.length > 0 ? (
        <ul className="divide-y divide-border/70 rounded-2xl border border-border/70">
          {locations.map((loc) => (
            <li key={loc.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={selected.includes(loc.id)} onChange={() => toggle(loc.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                <span className="font-medium">{loc.name}</span>
              </label>
              {!loc.isActive ? <span className="text-xs text-muted-foreground">{t("לא פעיל", "Inactive")}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t("לא נמצאו מיקומים.", "No locations found.")}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={busy !== null}>
          {busy === "save" ? t("שומר…", "Saving…") : t("שמירת הבחירה", "Save selection")}
        </Button>
        <Button variant="secondary" onClick={() => void sync()} disabled={busy !== null}>
          <RefreshCw className={busy === "sync" ? "me-2 h-4 w-4 animate-spin" : "me-2 h-4 w-4"} aria-hidden />
          {busy === "sync" ? t("מסנכרן…", "Syncing…") : t("סנכרון מלאי לפי מיקום עכשיו", "Sync inventory by location now")}
        </Button>
        <button type="button" onClick={() => void load(true)} disabled={busy !== null} className="text-xs text-muted-foreground hover:text-foreground">
          {t("רענון רשימת המיקומים", "Refresh location list")}
        </button>
      </div>
      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
        {syncedAt
          ? t(`מלאי לפי מיקום סונכרן לאחרונה: ${new Date(syncedAt).toLocaleString("he-IL")}`, `Inventory by location last synced: ${new Date(syncedAt).toLocaleString("en-US")}`)
          : t("מלאי לפי מיקום עדיין לא סונכרן — לחצו על הסנכרון למעלה.", "Inventory by location has not been synced yet — use the sync button above.")}
      </p>
      {message ? <p className="text-emerald-700">{message}</p> : null}
      {error ? <p className="text-danger">{error}</p> : null}
    </div>
  );
}
