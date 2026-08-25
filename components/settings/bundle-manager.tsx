"use client";

// Bundle composition manager (F-036).
//
// Shopify sells a kit as one product and hides its contents, so bundle
// profitability was unanswerable. The owner defines what's inside each kit
// here; the profit page then reports the kit's TRUE margin from component
// costs. CRUD against /api/bundles, same pattern as the other managers.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Package, Trash2 } from "lucide-react";

interface BundleComponentRow {
  id: string;
  componentProductId: string;
  title: string;
  quantity: number;
  effectiveUnitCost: number;
  hasRealCost: boolean;
}

interface BundleRow {
  bundleProductId: string;
  title: string;
  price: number;
  components: BundleComponentRow[];
  trueUnitCost: number;
  bookedUnitCost: number;
}

interface ProductOption {
  productId: string;
  title: string;
  price: number;
}

export function BundleManager({ isHe }: { isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // New-component form state: which bundle, which component, how many.
  const [bundleProductId, setBundleProductId] = useState("");
  const [componentProductId, setComponentProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const load = useCallback(async () => {
    setError(null);
    try {
      const resp = await fetch("/api/bundles", { cache: "no-store" });
      const body = await resp.json();
      if (!resp.ok || !body?.ok)
        throw new Error(body?.error ?? (isHe ? "הטעינה נכשלה." : "Failed to load."));
      setBundles(body.bundles ?? []);
      setProducts(body.products ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : isHe ? "הטעינה נכשלה." : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [isHe]);

  useEffect(() => {
    load();
  }, [load]);

  const addComponent = async () => {
    if (!bundleProductId || !componentProductId) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleProductId,
          componentProductId,
          quantity: Number(quantity) || 1
        })
      });
      const body = await resp.json();
      if (!resp.ok || !body?.ok) throw new Error(body?.error ?? lang("השמירה נכשלה.", "Save failed."));
      setComponentProductId("");
      setQuantity("1");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : lang("השמירה נכשלה.", "Save failed."));
    } finally {
      setBusy(false);
    }
  };

  const removeComponent = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/bundles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const body = await resp.json();
      if (!resp.ok || !body?.ok) throw new Error(body?.error ?? lang("המחיקה נכשלה.", "Remove failed."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : lang("המחיקה נכשלה.", "Remove failed."));
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number) => `₪${n.toLocaleString(isHe ? "he-IL" : "en-US", { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Package className="h-4 w-4" aria-hidden />
          {lang("הרכב באנדלים (מארזים)", "Bundle composition")}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {lang(
            "הגדירו מה נמצא בתוך כל מארז — ועמוד הרווחיות יחשב כמה המארז באמת מרוויח אחרי עלות המוצרים שבתוכו, במקום הערכה לפי יחס.",
            "Define what each kit contains — the profit page then computes what the bundle really earns after its component costs, instead of a ratio guess."
          )}
        </p>
      </div>

      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}

      {/* Add-component form */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
        <select
          value={bundleProductId}
          onChange={(e) => setBundleProductId(e.target.value)}
          className="h-8 min-w-[180px] flex-1 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200"
          aria-label={lang("המארז", "Bundle product")}
        >
          <option value="">{lang("בחרו מארז...", "Pick the bundle...")}</option>
          {products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.title}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{lang("מכיל", "contains")}</span>
        <select
          value={componentProductId}
          onChange={(e) => setComponentProductId(e.target.value)}
          className="h-8 min-w-[180px] flex-1 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200"
          aria-label={lang("המוצר שבתוך המארז", "Component product")}
        >
          <option value="">{lang("בחרו מוצר...", "Pick a component...")}</option>
          {products
            .filter((p) => p.productId !== bundleProductId)
            .map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.title}
              </option>
            ))}
        </select>
        <input
          type="number"
          min={1}
          max={99}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-center text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-200"
          aria-label={lang("כמות יחידות במארז", "Units per kit")}
        />
        <button
          type="button"
          onClick={addComponent}
          disabled={busy || !bundleProductId || !componentProductId}
          className="h-8 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : lang("הוספה", "Add")}
        </button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {lang("טוען...", "Loading...")}
        </p>
      ) : bundles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {lang("עוד לא הוגדרו מארזים. בחרו מארז והוסיפו את המוצר הראשון שבתוכו.", "No bundles defined yet. Pick a kit above and add its first component.")}
        </p>
      ) : (
        <div className="space-y-3">
          {bundles.map((bundle) => (
            <div key={bundle.bundleProductId} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold" title={bundle.title}>
                  {bundle.title}
                </p>
                <p className="shrink-0 text-[11px] text-muted-foreground">
                  {lang(
                    `עלות אמיתית ליחידה: ${fmt(bundle.trueUnitCost)} · הרישום הנוכחי: ${fmt(bundle.bookedUnitCost)}`,
                    `True unit cost: ${fmt(bundle.trueUnitCost)} · currently booked: ${fmt(bundle.bookedUnitCost)}`
                  )}
                </p>
              </div>
              <ul className="mt-2 space-y-1">
                {bundle.components.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">
                      {c.quantity}× {c.title}
                      {!c.hasRealCost ? (
                        <span className="ms-1.5 text-[10px] text-amber-700">
                          {lang("(עלות משוערת — כדאי להזין עלות אמיתית)", "(estimated cost — set a real one)")}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
                      {fmt(c.effectiveUnitCost * c.quantity)}
                      <button
                        type="button"
                        onClick={() => removeComponent(c.id)}
                        disabled={busy}
                        aria-label={lang(`הסרת ${c.title}`, `Remove ${c.title}`)}
                        className="text-muted-foreground hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
