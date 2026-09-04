// Tool schemas for the BI analyst chat (lib/services/bi-chat-service.ts).
//
// Kept in a dependency-free module so the multi-tenant leak-probe tests
// (tests/unit/bi-chat-isolation.test.ts) can inspect them without pulling
// in the SDK or the service layer.
//
// INVARIANT (tested): no tool schema may expose a parameter that names a
// store, org, shop, or tenant. storeId is resolved from the authenticated
// session inside the service — the model must have no way to point a tool
// at another store.

// Optional explicit date window (store-local, YYYY-MM-DD). When BOTH `start`
// and `end` are given they OVERRIDE `days` and let the analyst query ANY
// historical period — e.g. a past promotion week in July — instead of only a
// window ending today. Without them the tool falls back to `days` (trailing
// from today). This is what lets Hiloma answer "as of…", "back in July", and
// before/during/after questions. These name a date range, never a tenant, so
// the isolation invariant still holds.
const WINDOW_START = {
  type: "string" as const,
  description:
    "Optional window start date, YYYY-MM-DD in store-local time. Provide TOGETHER WITH `end` to analyze a specific historical period (a past promo, a month, before/during/after). Overrides `days` when both are set."
};
const WINDOW_END = {
  type: "string" as const,
  description:
    "Optional window end date, YYYY-MM-DD in store-local time (inclusive). Provide TOGETHER WITH `start`. Overrides `days` when both are set."
};

export const BI_TOOL_DEFINITIONS = [
  {
    name: "get_profit_summary",
    description:
      "Profit and contribution margin for the store over a recent window: gross revenue (Shopify-parity), discounts, refunds, COGS, affiliate commission, net shipping, contribution margin and margin rate, and order count. Includes a data-quality block: products missing cost inputs, share of revenue backed by real COGS, and a confidence grade — use it to caveat and to name the missing-cost products worth fixing. Use for any question about revenue, profit, margin, or costs.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "Window length in days, ending today. Default 30. Use days: 1 for TODAY ONLY — there is no minimum window."
        },
        start: WINDOW_START,
        end: WINDOW_END
      },
      required: []
    }
  },
  {
    name: "get_kpi_trend",
    description:
      "Time-series of the store's core KPIs — the trend tool. Returns bucketed series (day/week/month) of revenue, estimated contribution margin and margin rate, orders, AOV, discount rate, refund rate, and new vs returning customers, plus per-metric change vs the prior bucket, an outlier flag on buckets outside the trailing range, and a revenue-vs-margin divergence check. Use for any 'trend', 'change over time', or 'compare periods' question instead of calling point-in-time tools twice. The last bucket may be partial — it is flagged.",
    input_schema: {
      type: "object" as const,
      properties: {
        granularity: {
          type: "string",
          enum: ["day", "week", "month"],
          description: "Bucket size. Default week."
        },
        days: {
          type: "integer",
          minimum: 14,
          maximum: 730,
          description: "Lookback window in days, ending today. Default 90."
        }
      },
      required: []
    }
  },
  {
    name: "get_channel_performance",
    description:
      "Where sales come from, over a recent window: per channel (Meta, Google, affiliates/influencer codes, organic, etc.) — orders, revenue, new vs returning customers, average order value, and a per-channel data-quality flag. Also returns overall attribution coverage (share of orders with any UTM/referrer/coupon signal) — caveat first when it is low. Use for questions about channels or where sales come from. For ad-level or creative-level questions use get_ad_performance instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "Window length in days, ending today. Default 30. Use days: 1 for TODAY ONLY — there is no minimum window."
        },
        start: WINDOW_START,
        end: WINDOW_END
      },
      required: []
    }
  },
  {
    name: "get_ad_performance",
    description:
      "Meta Ads performance at campaign, ad-set and ad level over a recent window: spend, clicks, CPC, CTR, CPM, purchases, ROAS per row, full funnel (impressions → link clicks → landing-page views → add-to-cart → checkout → purchases), and daily spend curves. Also returns the store's blended contribution-margin rate and COGS coverage for the same window so you can compute margin-adjusted ROAS (ROAS × blended margin rate) — always say whether you used margin-adjusted or plain ROAS and why. Google Ads is not connected; video hook-rate is not available. Returns a note instead of data when Meta Ads is not connected.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "Window length in days, ending today. Default 30. Use days: 1 for TODAY ONLY — there is no minimum window."
        },
        start: WINDOW_START,
        end: WINDOW_END
      },
      required: []
    }
  },
  {
    name: "get_discount_effectiveness",
    description:
      "Per-discount-code scorecards over a recent window: uses, revenue, discount cost (₪ given away), COGS, margin after discount and margin rate, AOV vs the non-discounted baseline AOV, new-customer share, whether cost data backs the margin, activity trend, and a verdict per code (expand / keep / stop) with the reason. Also returns total discount cost and the share of orders using any code, plus the store's daily Meta ad spend for the same window so you can check whether a discount's lift overlaps an ad-spend spike before attributing it — this data is correlational, say so.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "Window length in days, ending today. Default 60."
        },
        start: WINDOW_START,
        end: WINDOW_END
      },
      required: []
    }
  },
  {
    name: "get_traffic",
    description:
      "Site traffic from Google Analytics 4 over a recent window: daily sessions, users, new users, conversions and revenue, plus totals per acquisition channel group (Organic Search, Paid Social, Direct, etc.) and the overall session→conversion rate. This sees the visits that did NOT convert — use it for questions about traffic, conversion rate, or 'traffic up but orders flat'. Returns a note instead of data when GA4 is not connected or has no rows yet.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "integer",
          minimum: 7,
          maximum: 90,
          description:
            "Window length in days, ending today. Default 30. GA4 rolls up daily and this tool has a 7-day MINIMUM — it cannot answer 'today'. For today's sales use get_profit_summary or get_orders with days: 1."
        },
        start: WINDOW_START,
        end: WINDOW_END
      },
      required: []
    }
  },
  {
    name: "get_organic_search",
    description:
      "Organic search performance from Google Search Console (rolling ~90-day rollup): top queries and top pages by clicks, each with impressions, clicks and average position, plus overall totals. Use for SEO questions — what people search to find the store, which pages earn clicks, where rankings sit. Returns a note instead of data when GSC is not connected or not yet synced.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "integer",
          minimum: 5,
          maximum: 50,
          description: "Max queries and pages to return, by clicks. Default 15."
        }
      },
      required: []
    }
  },
  {
    name: "get_retention",
    description:
      "Monthly cohort retention: for each first-order-month cohort, cohort size and how many customers ordered again in month +1, +2, +3…, as counts and rates. Compare the newest cohorts to older cohorts at the same age to say whether retention is improving. Use for questions about returning customers, retention, LTV direction, or repeat purchase behavior.",
    input_schema: {
      type: "object" as const,
      properties: {
        lookback_months: {
          type: "integer",
          minimum: 1,
          maximum: 24,
          description: "How many cohort months to include. Default 12."
        }
      },
      required: []
    }
  },
  {
    name: "get_open_alerts",
    description:
      "Open alerts awaiting the merchant's decision: stockout risks, ROAS collapses, competitor promo moves, commission leakage and other detected issues, each with severity, description, and a recommended action. Order your answer by ₪ impact, not by the severity label. Use for 'what needs my attention' questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max alerts to return, newest first. Default 20."
        }
      },
      required: []
    }
  },
  {
    name: "get_orders",
    description:
      "Individual orders. Either a filtered list over a window (date, value range, refunded-only, cancelled-only, discount code, channel) or ONE specific order looked up by its order number. Returns per order: order number, date, totals, discounts, refunds, tax, shipping, financial and fulfilment status, item count, line items, referring site and landing URL, and a customer reference. Use for 'show me the last orders', 'what happened in order 1042', 'which orders were refunded', 'biggest order this month'. Customer names and emails are withheld unless the store has enabled customer PII for the assistant — you will see a stable customer reference instead, which is enough to group orders by buyer.",
    input_schema: {
      type: "object" as const,
      properties: {
        order_number: {
          type: "string",
          description:
            "Look up one specific order by its number (with or without a leading #). When set, all other filters are ignored."
        },
        days: { type: "integer", minimum: 1, maximum: 365, description: "Window length in days, ending today. Default 30. Use days: 1 for TODAY ONLY — there is no minimum window." },
        start: WINDOW_START,
        end: WINDOW_END,
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max orders to return. Default 20." },
        sort_by: {
          type: "string",
          enum: ["newest", "oldest", "highest_value", "lowest_value"],
          description: "Ordering. Default newest."
        },
        min_total: { type: "number", description: "Only orders with total price at or above this." },
        max_total: { type: "number", description: "Only orders with total price at or below this." },
        refunded_only: { type: "boolean", description: "Only orders carrying a refund. Default false." },
        cancelled_only: { type: "boolean", description: "Only cancelled orders. Default false." },
        discount_code: { type: "string", description: "Only orders that used this discount code." },
        include_line_items: {
          type: "boolean",
          description: "Include each order's line items. Default true for a single-order lookup, false for lists (they get large)."
        }
      },
      required: []
    }
  },
  {
    name: "get_customers",
    description:
      "Customers of this store: ranked lists (highest lifetime value, most orders, newest, most recently active) plus store-wide totals — customer count, new vs returning split, average lifetime value and average orders per customer. Returns per customer: a stable reference, order count, lifetime value, first and most recent order dates, and returning status. Use for 'who are my best customers', 'how many repeat buyers', 'what is average customer value'. Names and emails are withheld unless the store has enabled customer PII for the assistant. For cohort retention curves over time use get_retention instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "How many customers to return. Default 15." },
        sort_by: {
          type: "string",
          enum: ["lifetime_value", "order_count", "newest", "recent_activity"],
          description: "Ranking metric. Default lifetime_value."
        },
        returning_only: { type: "boolean", description: "Only customers with more than one order. Default false." },
        min_orders: { type: "integer", minimum: 1, maximum: 100, description: "Only customers with at least this many orders." }
      },
      required: []
    }
  },
  {
    name: "get_product_performance",
    description:
      "Per-product sales and profitability over a recent window: net units sold (after returns), gross sales, discounts, refunds, net sales, COGS and contribution margin per product, plus each product's share of the store's net sales and its return rate. Also returns a cost-coverage flag per product so you can say when a margin figure is unreliable because cost inputs are missing. THIS IS THE TOOL FOR ANY QUESTION ABOUT PRODUCTS — best seller, worst seller, what to restock, which product makes money, which product is returned most. Ad-creative names are NOT products; never infer a best seller from campaign or creative names.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "Window length in days, ending today. Default 30. Use days: 1 for TODAY ONLY — there is no minimum window."
        },
        start: WINDOW_START,
        end: WINDOW_END,
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 25,
          description: "How many products to return. Default 10."
        },
        sort_by: {
          type: "string",
          enum: ["net_sales", "contribution_margin", "units", "return_rate"],
          description:
            "Ranking metric. Default net_sales. Use contribution_margin for 'most profitable', units for 'best seller by volume', return_rate for 'most returned'."
        }
      },
      required: []
    }
  },
  {
    name: "get_competitor_week",
    description:
      "What the store's tracked competitors did over the last 7 days vs the 7 before: active promos, deepest discount %, free-shipping thresholds, homepage messages, and week-over-week change per competitor (opened/closed/deepened). Only surface what should change this merchant's behavior. Use for questions about competitors.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  }
];
