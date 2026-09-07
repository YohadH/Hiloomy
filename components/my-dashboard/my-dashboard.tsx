"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";

interface WatchedProduct {
  productId: string;
  title: string;
  vendor: string | null;
  threshold: number | null;
  addedAt: string;
  inventory: number | null;
  byLocation: Array<{ locationId: string; locationName: string; available: number }>;
  units14: number;
  revenue14: number;
  dailyVelocity: number;
  daysCover: number | null;
  lastSaleAt: string | null;
  status: "ok" | "below_threshold" | "low_cover" | "not_tracked";
}

interface PickerRow {
  id: string;
  title: string;
  vendor: string | null;
  price: string;
}

const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;

// The merchant's own board: products they chose to follow, each with stock
// at the selected locations, sales pace, days of cover and last sale.
export function MyDashboard({ locale, initial }: { locale: Locale; initial: { products: WatchedProduct[]; updatedAt: string } }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [products, setProducts] = useState<WatchedProduct[]>(initial.products);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&limit=8`);
        const body = await res.json().catch(() => ({}));
        const rows = (Array.isArray(body?.products) ? body.products : Array.isArray(body) ? body : []) as PickerRow[];
        setResults(rows.filter((r) => !products.some((p) => p.productId === r.id)));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, products]);

  const act = async (action: "add" | "remove" | "threshold", productId: string, threshold?: number | null) => {
    setBusy(productId);
    setError(null);
    try {
      const res = await fetch("/api/my-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, productId, threshold })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? t("הפעולה נכשלה.", "The action failed."));
      setProducts(body.products as WatchedProduct[]);
      if (action === "add") {
        setQuery("");
        setResults([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("אירעה שגיאה.", "Something went wrong."));
    } finally {
      setBusy(null);
    }
  };

  const attention = products.filter((p) => p.status === "below_threshold" || p.status === "low_cover");

  return (
    <div className="space-y-6">
      {/* Add products */}
      <Card className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("הוספת מוצר למעקב", "Add a product to follow")}</p>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("חיפוש לפי שם, ספק או SKU…", "Search by name, vendor or SKU…")}
            className="w-full rounded-xl border border-border bg-background py-2.5 pe-3 ps-9 text-base outline-none focus:border-emerald-400 sm:text-sm"
          />
          {searching ? <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden /> : null}
        </div>
        {results.length > 0 ? (
          <ul className="mt-2 divide-y divide-border/70 rounded-xl border border-border/70">
            {results.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {r.title}
                  {r.vendor ? <span className="text-muted-foreground"> · {r.vendor}</span> : null}
                </span>
                <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => void act("add", r.id)}>
                  <Plus className="me-1 h-3.5 w-3.5" aria-hidden />
                  {t("הוספה", "Add")}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </Card>

      {products.length === 0 ? (
        <Card className="p-8 text-sm text-muted-foreground">
          {t("עדיין אין מוצרים בדשבורד. חפשו מוצר למעלה והוסיפו אותו — למשל המוצרים המובילים שלכם או השקה חדשה.", "No products on the board yet. Search above and add one — your hero products, or a new launch.")}
        </Card>
      ) : (
        <>
          {attention.length > 0 ? (
            <p className="text-sm">
              <span className="font-semibold">{t(`${attention.length} מוצרים דורשים תשומת לב`, `${attention.length} product${attention.length === 1 ? "" : "s"} need attention`)}</span>
              <span className="text-muted-foreground"> · {t("מתחת לסף שהגדרתם או פחות מ־14 ימי כיסוי", "below your threshold or under 14 days of cover")}</span>
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => (
              <ProductCard key={p.productId} product={p} locale={locale} busy={busy === p.productId} onRemove={() => void act("remove", p.productId)} onThreshold={(v) => void act("threshold", p.productId, v)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProductCard({
  product: p,
  locale,
  busy,
  onRemove,
  onThreshold
}: {
  product: WatchedProduct;
  locale: Locale;
  busy: boolean;
  onRemove: () => void;
  onThreshold: (value: number | null) => void;
}) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [thresholdDraft, setThresholdDraft] = useState(p.threshold === null ? "" : String(p.threshold));
  const tone =
    p.status === "below_threshold" ? "border-red-300" : p.status === "low_cover" ? "border-orange-300" : p.status === "not_tracked" ? "border-dashed" : "border-border/80";
  const statusLabel =
    p.status === "below_threshold"
      ? t("מתחת לסף", "Below threshold")
      : p.status === "low_cover"
        ? t("כיסוי נמוך", "Low cover")
        : p.status === "not_tracked"
          ? t("ללא מעקב מלאי", "Not tracked")
          : t("תקין", "OK");

  return (
    <Card className={cn("space-y-4 p-5", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{p.title}</h3>
          {p.vendor ? <p className="text-xs text-muted-foreground">{p.vendor}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
              p.status === "below_threshold" ? "border-red-300 text-red-700" : p.status === "low_cover" ? "border-orange-300 text-orange-700" : "border-border text-muted-foreground"
            )}
          >
            {statusLabel}
          </span>
          <button type="button" onClick={onRemove} disabled={busy} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("הסרה", "Remove")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("במלאי", "In stock")} value={p.inventory === null ? "—" : p.inventory.toLocaleString("en-US")} />
        <Stat label={t("ימי כיסוי", "Days cover")} value={p.daysCover === null ? "—" : p.daysCover.toFixed(0)} />
        <Stat label={t("מכירות / 14 יום", "Sales / 14d")} value={`${p.units14}`} note={ils(p.revenue14)} />
      </div>

      {p.byLocation.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {p.byLocation.map((l) => (
            <li key={l.locationId} className="flex justify-between gap-2">
              <span className="truncate">{l.locationName}</span>
              <span className="tabular-nums text-foreground">{l.available}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span suppressHydrationWarning>
          {t("מכירה אחרונה", "Last sale")}: {p.lastSaleAt ? new Date(p.lastSaleAt).toLocaleDateString(isHe ? "he-IL" : "en-US", { month: "short", day: "numeric" }) : t("אין", "none")}
        </span>
        <label className="flex items-center gap-1.5">
          <span>{t("התראה מתחת ל־", "Alert below")}</span>
          <input
            type="number"
            min={0}
            value={thresholdDraft}
            onChange={(e) => setThresholdDraft(e.target.value)}
            onBlur={() => onThreshold(thresholdDraft.trim() === "" ? null : Number(thresholdDraft))}
            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-emerald-400"
            placeholder="—"
          />
          <span>{t("יח׳", "units")}</span>
        </label>
      </div>
    </Card>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
