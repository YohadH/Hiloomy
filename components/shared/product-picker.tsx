"use client";

// ProductPicker — searchable grid of the store's Shopify products.
//
// Used by: Sprint launcher (single-select for brief generation), Quick
// Batch (single-select for image generation), /creative/new form
// (single-select to pre-fill brief).
//
// Surface: a search input + grid of product cards (image + title +
// price + vendor). Clicking a card selects it (or toggles when
// multi-select).
//
// Self-fetches from /api/products with a 300ms debounce on the search
// input so we don't hammer the endpoint while the operator types.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Search, X } from "lucide-react";
import type { ProductPickerRow } from "@/app/api/products/route";
import type { AppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SelectedProduct = ProductPickerRow;

interface Props {
  locale: AppLocale;
  // Currently selected product(s). Pass [] for none. Single-select callers
  // can pass an array of length 0 or 1 and ignore the array shape.
  selected: SelectedProduct[];
  onChange: (next: SelectedProduct[]) => void;
  // single = at most 1 selection. multi allows N selections.
  mode?: "single" | "multi";
  // How many products the API returns per search. Caller can show "load
  // more" later if needed (not implemented in v1).
  limit?: number;
  // Show a "clear selection" X button alongside the search input.
  clearable?: boolean;
}

export function ProductPicker({ locale, selected, onChange, mode = "single", limit = 20, clearable = true }: Props) {
  const isHe = locale === "he";
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductPickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);

  // Debounced fetch on query change.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/products", window.location.origin);
        if (query.trim()) url.searchParams.set("q", query.trim());
        url.searchParams.set("limit", String(limit));
        const res = await fetch(url.toString());
        const body = (await res.json()) as { ok: boolean; products?: ProductPickerRow[]; error?: string };
        if (!body.ok) throw new Error(body.error || `HTTP ${res.status}`);
        setProducts(body.products ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, limit]);

  function toggle(product: ProductPickerRow) {
    if (mode === "single") {
      onChange(selectedIds.has(product.id) ? [] : [product]);
      return;
    }
    if (selectedIds.has(product.id)) {
      onChange(selected.filter((p) => p.id !== product.id));
    } else {
      onChange([...selected, product]);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className={cn("pointer-events-none absolute top-2.5 h-4 w-4 text-muted-foreground", isHe ? "right-3" : "left-3")} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isHe ? "חיפוש מוצר…" : "Search products…"}
          className={cn("w-full rounded-lg border border-border bg-background py-2 text-sm", isHe ? "pe-9 ps-3" : "ps-9 pe-3")}
        />
        {clearable && selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className={cn("absolute top-2.5 text-xs text-muted-foreground hover:text-foreground", isHe ? "left-3" : "right-3")}
            title={isHe ? "ניקוי בחירה" : "Clear selection"}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      ) : null}

      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
        {loading && products.length === 0 ? (
          <div className="col-span-full flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {query
              ? isHe
                ? "לא נמצאו מוצרים התואמים לחיפוש."
                : "No products match that search."
              : isHe
                ? "אין מוצרים זמינים."
                : "No products available."}
          </div>
        ) : (
          products.map((p) => {
            const isSelected = selectedIds.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p)}
                className={cn(
                  "group block overflow-hidden rounded-lg border text-start transition focus:outline-none focus:ring-2 focus:ring-primary",
                  isSelected ? "border-primary ring-2 ring-primary" : "border-border hover:border-foreground/30"
                )}
              >
                <div className="relative aspect-square w-full bg-muted">
                  {p.imageUrl ? (
                    <Image src={p.imageUrl} alt={p.title} fill className="object-cover" sizes="160px" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      {isHe ? "אין תמונה" : "No image"}
                    </div>
                  )}
                  {isSelected ? (
                    <div className="absolute top-1 end-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      ✓
                    </div>
                  ) : null}
                </div>
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-xs font-medium" title={p.title}>
                    {p.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    ₪{Number(p.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    {p.vendor ? ` · ${p.vendor}` : ""}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {selected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {isHe ? `נבחרו ${selected.length}` : `${selected.length} selected`}
          {": "}
          <span className="font-medium text-foreground">{selected.map((p) => p.title).join(", ")}</span>
        </p>
      ) : null}
    </div>
  );
}
