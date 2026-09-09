// Where an order was taken. Shopify stamps every order with `source_name`
// (stored as Order.sourceName): "web" for the online store, "pos" for
// Shopify POS, "shopify_draft_order" for draft/manual orders, "iphone" /
// "android" for orders created from the Shopify admin app, and an app id or
// channel handle (buy_button, facebook, instagram, google, tiktok…) for
// sales channels. We fold those into four buckets the manager can act on.

export type SalesChannel = "online" | "pos" | "manual" | "unknown";

export const SALES_CHANNEL_ORDER: SalesChannel[] = ["online", "pos", "manual", "unknown"];

export const SALES_CHANNEL_LABEL: Record<SalesChannel, { he: string; en: string }> = {
  online: { he: "אונליין", en: "Online" },
  pos: { he: "קופה (Shopify POS)", en: "Shopify POS" },
  manual: { he: "ידני / טיוטה", en: "Manual / draft" },
  unknown: { he: "לא ידוע", en: "Unknown" }
};

const MANUAL = new Set(["shopify_draft_order", "iphone", "android"]);

export function classifySalesChannel(sourceName: string | null | undefined): SalesChannel {
  const s = (sourceName ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s === "pos" || s.startsWith("pos_") || s === "shopify_pos") return "pos";
  if (MANUAL.has(s)) return "manual";
  // "web", "buy_button", a sales-channel handle, or a numeric app id — all
  // customer-facing online orders.
  return "online";
}

// ─── Channel FILTER (Command Center money + trend, 9 Sep 2026) ────────────
// The manager can look at the store's money for everything, for the online
// store only, or for Shopify POS only. "Online" here means every order that
// is not POS — web, sales channels, draft/manual and orders with no source —
// the same rule the offline comparison uses, so the two surfaces agree.
export type SalesChannelFilter = "all" | "online" | "pos";

export const SALES_CHANNEL_FILTERS: SalesChannelFilter[] = ["all", "online", "pos"];

export const SALES_CHANNEL_FILTER_LABEL: Record<SalesChannelFilter, { he: string; en: string }> = {
  all: { he: "הכול", en: "All" },
  online: { he: "אונליין בלבד", en: "Online only" },
  pos: { he: "קופה (POS) בלבד", en: "POS only" }
};

// Exact and prefixed POS source names Shopify stamps on point-of-sale orders.
export const POS_SOURCE_NAMES = ["pos", "shopify_pos"] as const;
export const POS_SOURCE_PREFIX = "pos_";

export function parseSalesChannelFilter(value: string | string[] | null | undefined): SalesChannelFilter {
  const v = (Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase();
  return v === "online" || v === "pos" ? v : "all";
}
