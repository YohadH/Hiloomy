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
          description: "Window length in days, ending today. Default 30."
        }
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
          description: "Window length in days, ending today. Default 30."
        }
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
          description: "Window length in days, ending today. Default 30."
        }
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
        }
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
          description: "Window length in days, ending today. Default 30."
        }
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
