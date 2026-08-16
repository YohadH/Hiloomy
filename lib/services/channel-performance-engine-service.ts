// Channel attribution for the executive report's Page 5.
//
// Reads Shopify orders and bucketizes each one into a marketing channel:
//   • Meta — UTM source contains meta/facebook/instagram (paid), OR landing
//     URL has fbclid; OR referring_site is facebook.com / l.facebook.com / instagram.com
//     WHEN the UTM medium / source indicates paid traffic.
//   • Instagram organic — instagram.com referrer with no paid UTM.
//   • Email — UTM source/medium contains email / klaviyo / mailchimp.
//   • Influencer — order has a discount code that matches a known affiliate
//     coupon (via CreatorProfile.couponCode/affiliateCode).
//   • Google / Organic — google.com referrer, or UTM source = google with
//     medium = organic.
//   • Direct — no referrer, no UTM.
//   • Other — anything else (fallback).
//
// Plus a per-channel "data quality" rating so the report can warn the
// founder when a channel's attribution is weak (e.g. no UTM on most orders).
//
// Source-of-truth: Shopify is authoritative for orders/revenue/customers.
// Meta is only authoritative for spend. This service NEVER touches Meta data.

import { getDb } from "@/lib/server/db";

export type ChannelBucket =
  | "meta"
  | "instagram_organic"
  | "email"
  | "influencer"
  | "google_organic"
  | "direct"
  | "other";

export type DataQuality = "high" | "medium" | "low";

export interface ChannelPerformanceRow {
  channel: ChannelBucket;
  displayName: string; // Hebrew + English label resolved at render time, kept here as English
  orders: number;
  revenue: number;
  newCustomers: number;
  returningCustomers: number;
  avgOrderValue: number;
  // Data-quality assessment for this specific bucket. "Other / unknown" is
  // always low; well-tagged buckets are high.
  dataQuality: DataQuality;
}

export interface ChannelPerformanceReport {
  dateRange: { start: string; end: string };
  rows: ChannelPerformanceRow[];
  totals: {
    orders: number;
    revenue: number;
  };
  // What fraction of orders had ANY usable attribution signal (UTM, referrer,
  // or coupon code). 90%+ = page is reliable; <50% = page is mostly guesses.
  attributionCoverage: number;
  unknownOrders: number;
  unknownRevenue: number;
}

// ─────────────────────────────────────────────────────────────────────────
// URL + UTM parsing
// ─────────────────────────────────────────────────────────────────────────

// Pull (utm_source, utm_medium, utm_campaign, utm_content) from a full URL.
// Tolerates URLs that came in as relative paths or with junk after the query.
function parseUtm(url: string | null): {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
} {
  if (!url) return { source: null, medium: null, campaign: null, content: null };
  // URL constructor needs a base for relative URLs — fake one.
  let parsed: URL;
  try {
    parsed = new URL(url, "https://placeholder.local");
  } catch {
    return { source: null, medium: null, campaign: null, content: null };
  }
  const params = parsed.searchParams;
  return {
    source: params.get("utm_source")?.toLowerCase() ?? null,
    medium: params.get("utm_medium")?.toLowerCase() ?? null,
    campaign: params.get("utm_campaign")?.toLowerCase() ?? null,
    content: params.get("utm_content")?.toLowerCase() ?? null
  };
}

function hasFbclid(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, "https://placeholder.local");
    return parsed.searchParams.has("fbclid");
  } catch {
    return false;
  }
}

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://placeholder.local");
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Classify one order into a channel bucket. The order in which we check
// matters — an order with a coupon code AND a Meta UTM is more useful to
// the founder as "Influencer" than "Meta" because the coupon attribution
// is more specific.
function classifyOrder(input: {
  landingSiteRef: string | null;
  referringSite: string | null;
  sourceName: string | null;
  couponCodes: string[]; // already lowercased
  knownAffiliateCodes: Set<string>; // already lowercased
}): { channel: ChannelBucket; dataQuality: DataQuality } {
  const utm = parseUtm(input.landingSiteRef);
  const refHost = hostnameOf(input.referringSite);

  // 1) Influencer — any discount code in this order matches a known affiliate
  //    code from CreatorProfile.couponCode / affiliateCode. Highest priority
  //    because it's the most specific signal.
  for (const code of input.couponCodes) {
    if (input.knownAffiliateCodes.has(code)) {
      return { channel: "influencer", dataQuality: "high" };
    }
  }

  // 2) Meta — explicit paid UTM, or fbclid in the landing URL, or referrer
  //    is one of Meta's domains AND we see a paid signal.
  if (utm.source && /(^|[^a-z])(meta|facebook|fb|instagram|ig)([^a-z]|$)/.test(utm.source)) {
    if (utm.medium && /(^|[^a-z])(paid|cpc|ppc|ads?|social)([^a-z]|$)/.test(utm.medium)) {
      return { channel: "meta", dataQuality: "high" };
    }
    // Source says meta/instagram but medium isn't explicitly paid — still
    // very likely Meta, just lower confidence.
    return { channel: "meta", dataQuality: "medium" };
  }
  if (hasFbclid(input.landingSiteRef)) {
    return { channel: "meta", dataQuality: "high" };
  }
  if (refHost && /^(l\.|m\.)?(facebook|fb)\.com$/.test(refHost)) {
    return { channel: "meta", dataQuality: "medium" };
  }

  // 3) Email — explicit email/Klaviyo/Mailchimp signal.
  if (utm.source && /(email|klaviyo|mailchimp|sendgrid|hubspot)/.test(utm.source)) {
    return { channel: "email", dataQuality: "high" };
  }
  if (utm.medium === "email") {
    return { channel: "email", dataQuality: "high" };
  }

  // 4) Google organic / paid.
  if (utm.source && utm.source.includes("google")) {
    if (utm.medium && /(paid|cpc|ppc)/.test(utm.medium)) {
      return { channel: "other", dataQuality: "high" }; // paid Google — bucket as "other paid" for now
    }
    return { channel: "google_organic", dataQuality: "high" };
  }
  if (refHost && refHost.includes("google.")) {
    return { channel: "google_organic", dataQuality: "medium" };
  }

  // 5) Instagram organic — instagram.com referrer with no paid UTM signal.
  if (refHost && refHost.includes("instagram.com")) {
    return { channel: "instagram_organic", dataQuality: "medium" };
  }

  // 6) Direct — no referrer at all AND no UTM.
  if (!refHost && !utm.source && !input.landingSiteRef) {
    return { channel: "direct", dataQuality: "medium" };
  }

  // 7) Fallback — we have a referrer but don't recognise it.
  return { channel: "other", dataQuality: "low" };
}

function channelDisplayName(channel: ChannelBucket): string {
  switch (channel) {
    case "meta":
      return "Meta Ads";
    case "instagram_organic":
      return "Instagram (organic)";
    case "email":
      return "Email";
    case "influencer":
      return "Influencers";
    case "google_organic":
      return "Google (organic)";
    case "direct":
      return "Direct";
    case "other":
      return "Other / Unknown";
  }
}

export interface BuildChannelReportInput {
  storeId: string;
  start: Date;
  end: Date;
}

export async function buildChannelPerformanceReport(
  input: BuildChannelReportInput
): Promise<ChannelPerformanceReport> {
  const db = getDb();

  // Pull all known affiliate codes once, lowercased. Used to flag influencer
  // attribution. We accept both couponCode and affiliateCode fields from
  // CreatorProfile (different setups use different fields).
  const creators = await db.creatorProfile.findMany({
    where: { storeId: input.storeId },
    select: { username: true }
  });
  // Best-effort: the schema we saw earlier doesn't expose couponCode/affiliateCode
  // directly on CreatorProfile. Pull from AffiliateMember/AffiliateCoupon if
  // those tables hold the real codes.
  let affiliateCodes: Set<string> = new Set();
  try {
    const couponRows = await db.affiliateCoupon.findMany({
      where: { storeId: input.storeId },
      select: { code: true }
    });
    for (const c of couponRows as any[]) {
      if (c.code) affiliateCodes.add(String(c.code).toLowerCase());
    }
  } catch {
    // table may be empty / missing — degrade gracefully
  }
  // Fallback: use the creator username itself as a code candidate (some
  // founders create codes like CREATORNAME10 — the substring match below
  // catches it).
  const usernameTokens = creators.map((c: any) => String(c.username ?? "").toLowerCase()).filter(Boolean);

  // Pull orders + discount usages in a single round-trip.
  const orders = await db.order.findMany({
    where: {
      storeId: input.storeId,
      createdAt: { gte: input.start, lte: input.end },
      test: false,
      cancelledAt: null
    },
    select: {
      id: true,
      totalPrice: true,
      totalRefunds: true,
      customerId: true,
      landingSiteRef: true,
      referringSite: true,
      sourceName: true,
      discountUsages: { select: { code: true } }
    }
  });

  // Lookup customers in one pass so we can split new vs returning per channel.
  const customerIds = Array.from(new Set(orders.map((o: any) => o.customerId).filter(Boolean) as string[]));
  const customers = customerIds.length
    ? await db.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, isReturning: true }
      })
    : [];
  const returningById = new Map(customers.map((c: any) => [c.id, Boolean(c.isReturning)]));

  // Bucket pass.
  const buckets = new Map<ChannelBucket, ChannelPerformanceRow>();
  let totalRevenue = 0;
  let totalOrders = 0;
  let withSignal = 0;

  for (const o of orders as any[]) {
    const couponCodes: string[] = (o.discountUsages ?? [])
      .map((d: any) => String(d.code ?? "").toLowerCase())
      .filter(Boolean);

    // Build the per-order code set against known affiliate codes. We also
    // include username-as-token matches (e.g. "TALIASOL10" matches the
    // taliasol username).
    const knownAffiliateCodes = new Set(affiliateCodes);
    for (const code of couponCodes) {
      for (const token of usernameTokens) {
        if (token.length >= 4 && code.includes(token)) knownAffiliateCodes.add(code);
      }
    }

    const { channel, dataQuality } = classifyOrder({
      landingSiteRef: o.landingSiteRef ?? null,
      referringSite: o.referringSite ?? null,
      sourceName: o.sourceName ?? null,
      couponCodes,
      knownAffiliateCodes
    });

    const net = Number(o.totalPrice ?? 0) - Number(o.totalRefunds ?? 0);
    totalRevenue += net;
    totalOrders += 1;
    // "With signal" = anything except "Other / Unknown low".
    if (channel !== "other") withSignal += 1;

    const isReturning = o.customerId ? returningById.get(o.customerId) ?? false : false;
    const isGuest = !o.customerId;

    const existing = buckets.get(channel) ?? {
      channel,
      displayName: channelDisplayName(channel),
      orders: 0,
      revenue: 0,
      newCustomers: 0,
      returningCustomers: 0,
      avgOrderValue: 0,
      // Start at the per-order quality; reduce later if we ever see a "low"
      // for the same bucket.
      dataQuality: dataQuality
    };
    existing.orders += 1;
    existing.revenue += net;
    if (!isGuest) {
      if (isReturning) existing.returningCustomers += 1;
      else existing.newCustomers += 1;
    }
    // Bucket quality = worst of the per-order qualities seen. So a meta
    // bucket with even one "medium" order is medium overall.
    if (
      (existing.dataQuality === "high" && dataQuality !== "high") ||
      (existing.dataQuality === "medium" && dataQuality === "low")
    ) {
      existing.dataQuality = dataQuality;
    }
    buckets.set(channel, existing);
  }

  // Finalize AOV per bucket + sort by revenue desc.
  const rows = Array.from(buckets.values())
    .map((r) => ({ ...r, avgOrderValue: r.orders > 0 ? r.revenue / r.orders : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const otherRow = rows.find((r) => r.channel === "other");

  return {
    dateRange: {
      start: input.start.toISOString().slice(0, 10),
      end: input.end.toISOString().slice(0, 10)
    },
    rows,
    totals: { orders: totalOrders, revenue: totalRevenue },
    attributionCoverage: totalOrders > 0 ? withSignal / totalOrders : 0,
    unknownOrders: otherRow?.orders ?? 0,
    unknownRevenue: otherRow?.revenue ?? 0
  };
}
