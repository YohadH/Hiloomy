"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// GA4 connection card — mirrors the GSC card: OAuth connect + a property
// picker (the sync only runs once a property is chosen).

type Ga4ConnectionStatus = {
  status: string;
  tokenLastFour: string | null;
  healthMessage: string | null;
  lastSyncAt: string | null;
} | null;

export function Ga4ConnectionManager({
  storeId,
  initialConnection,
  ga4Connected,
  ga4Error
}: {
  storeId: string;
  initialConnection: Ga4ConnectionStatus;
  ga4Connected?: boolean;
  ga4Error?: string | null;
}) {
  const router = useRouter();
  const [connection, setConnection] = useState<Ga4ConnectionStatus>(initialConnection);
  const [error, setError] = useState<string | null>(ga4Error ?? null);
  const [successMsg, setSuccessMsg] = useState<string | null>(
    ga4Connected ? "Google Analytics connected — now pick the GA4 property below." : null
  );
  const [properties, setProperties] = useState<
    Array<{ property: string; displayName: string; accountName: string }> | null
  >(null);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [savedProperty, setSavedProperty] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isConnected = connection?.status === "connected";

  function startOAuth() {
    setError(null);
    setSuccessMsg(null);
    window.location.href = `/api/ga4/oauth/start?storeId=${encodeURIComponent(storeId)}`;
  }

  async function loadProperties() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ga4/properties?storeId=${encodeURIComponent(storeId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body?.error ?? "Could not load GA4 properties.");
      setProperties(body.properties ?? []);
      setSavedProperty(body.selectedProperty ?? null);
      setSelectedProperty(body.selectedProperty ?? body.properties?.[0]?.property ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load GA4 properties.");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/ga4/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body?.error ?? "GA4 sync failed.");
      setSuccessMsg(`Synced ${body.days} days of traffic (${body.rowsUpserted} rows). The dashboard section is live.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "GA4 sync failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProperty() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ga4/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, property: selectedProperty })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body?.error ?? "Could not save the property.");
      setSavedProperty(selectedProperty);
      setSuccessMsg("GA4 property saved. Traffic syncs on the next cron run (≤2h).");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the property.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
            <LineChart className="h-3.5 w-3.5" aria-hidden />
          </span>
          <CardTitle className="text-base">Google Analytics 4</CardTitle>
          {isConnected ? (
            <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Connected
            </span>
          ) : (
            <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
              <XCircle className="h-3 w-3" aria-hidden />
              Not connected
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Sync daily sessions, users, conversions and revenue by acquisition channel — the traffic
          picture behind the orders, including the visits that didn&apos;t convert.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {successMsg ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
            {successMsg}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>
        ) : null}

        {isConnected && connection ? (
          <div className="space-y-2 rounded-lg border border-border bg-background/70 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Synced property
              </span>
              <span className="font-mono text-xs" dir="ltr">
                {savedProperty ?? "not selected — sync is paused until you pick one"}
              </span>
            </div>
            {connection.lastSyncAt ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Last synced
                </span>
                <span suppressHydrationWarning className="tabular-nums">
                  {new Date(connection.lastSyncAt).toLocaleString()}
                </span>
              </div>
            ) : null}
            {properties === null ? (
              <Button variant="secondary" size="sm" onClick={loadProperties} disabled={busy}>
                {busy ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Choose property
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  dir="ltr"
                >
                  {properties.map((p) => (
                    <option key={p.property} value={p.property}>
                      {p.accountName} — {p.displayName} ({p.property})
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={saveProperty}
                  disabled={busy || !selectedProperty || selectedProperty === savedProperty}
                >
                  {busy ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  Save
                </Button>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {isConnected ? (
            <>
              {/* Always offered while connected — the API answers with a
                  clear "pick a property first" when none is saved yet
                  (savedProperty state only hydrates after Choose property). */}
              <Button size="sm" onClick={syncNow} disabled={busy}>
                {busy ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Sync now
              </Button>
              <Button variant="secondary" size="sm" onClick={startOAuth}>
                Reconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={startOAuth}>
              Connect Google Analytics
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Uses the same Google sign-in as Search Console. Only read-only access is requested.
        </p>
      </CardContent>
    </Card>
  );
}
