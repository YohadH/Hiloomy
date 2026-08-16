import { cookies } from "next/headers";

export type AppLocale = "en" | "he";

const LOCALE_COOKIE = "app-locale";

const dictionaries = {
  en: {
    common: {
      appName: "Hiloomy",
      menu: "Menu",
      connectedStore: "Connected store",
      storeSetup: "Store setup",
      exportSummary: "Export summary",
      last30Days: "Last 30 days",
      compareToPriorPeriod: "Compare to prior period",
      automationReady: "Automation-ready",
      automationCopy:
        "Weekly summaries, delivery workflows, and rule-based alerts are structured for service-led expansion.",
      founderAnalyticsCopy:
        "Founder-facing analytics for profit, retention, and weekly operating decisions.",
      shellHeroCopy:
        "Profit visibility, retention clarity, and weekly operator reporting."
    },
    nav: {
      overview: "Overview",
      profit: "Profit",
      retention: "Retention",
      creatorFlow: "Creator Commerce",
      weeklySummary: "Weekly Summary",
      alerts: "Alerts",
      settings: "Settings"
    },
    overview: {
      eyebrow: "Overview",
      title: "Decision support for the founder operating cadence",
      description:
        "A premium snapshot of what changed, why it matters, and where profit and retention performance need attention.",
      comparisonTitle: "Period comparison",
      comparisonDescription:
        "Quick context against the previous reporting window so operators can see whether gains are translating into healthier economics.",
      revenueProfitTrend: "Revenue and estimated profit trend",
      returningTrend: "Returning customer rate trend",
      insightsTitle: "Insight blocks",
      insightsDescription:
        "Founder-level interpretation of performance, rather than a wall of disconnected widgets.",
      actionsTitle: "Operating actions",
      actionsDescription:
        "What changed this week, what needs attention next, and how to respond without hunting through multiple dashboards.",
      topProductPerformance: "Top product performance",
      topProductDescription:
        "Profit-aware contribution by product, built on an extensible estimated cost model.",
      product: "Product",
      collection: "Collection",
      units: "Units",
      revenue: "Revenue",
      estimatedProfit: "Estimated Profit",
      alertsPreviewTitle: "Alerts requiring attention",
      changeLabel: "vs prior period",
      priorLabel: "Prior",
      tips: {
        page: "All numbers below compare your selected reporting window against the previous window of equal length.",
        kpis: "Headline KPIs for your store. The pill shows percentage change vs. the prior period — green is up, red is down.",
        comparison: "Side-by-side metric values for the current vs. prior period so you can sanity-check whether growth is improving margins, not just revenue.",
        revenueChart: "Daily revenue (gross sales) overlaid with estimated profit (revenue minus discounts, refunds, and configured product cost).",
        retentionChart: "Daily share of orders that came from returning customers. Higher = healthier repeat behavior.",
        insights: "AI-style summaries that translate raw numbers into a sentence a founder can act on.",
        actions: "Operator to-dos grouped by theme — pricing, retention, supply, content. Treat as a working punch list.",
        topProducts: "Top 5 products this period by revenue. 'Estimated Profit' uses your configured cost model; replace it with real COGS in Settings for accurate margins.",
        alerts: "The most recent rule-triggered alerts. Click through to the full Alerts page for severity breakdown and suggested actions."
      },
      colTips: {
        units: "Total units sold for this product across all orders in the selected window.",
        revenue: "Gross revenue from this product before refunds and platform fees.",
        profit: "Revenue minus discounts, refunds, and configured product cost. Approximation until real COGS is connected."
      }
    },
    profit: {
      eyebrow: "Profit Analytics",
      title: "Margin-aware performance for founders and operators",
      description:
        "Estimated profit is modeled as revenue minus discounts, refunds, and configurable estimated cost so real cost-of-goods data can slot in later without rewriting the experience.",
      salesByProduct: "Sales by product",
      salesByProductDescription: "Leading SKUs by revenue contribution.",
      profitByCollection: "Estimated profit by collection",
      profitByCollectionDescription: "Which collections are carrying contribution margin.",
      productTable: "Product-level profit table",
      productTableDescription:
        "Built to absorb real COGS data once Shopify and ERP cost data are wired in.",
      salesByCollection: "Sales by collection",
      discountImpact: "Discount impact",
      topProducts: "Top performing products",
      watchlistProducts: "Watchlist products",
      watchlistDescription:
        "Low-profit products that likely need pricing, bundling, or refund review.",
      bundleImpact: "Bundle impact",
      bundleDescription:
        "Placeholder for bundle-level contribution once kit attribution is connected.",
      bundleTodo:
        "TODO: Add Shopify Admin API ingestion for bundle composition, line item metadata, and order enrichment before enabling bundle contribution reporting.",
      refundImpact: "Refund and return impact",
      refundDescription:
        "Placeholder for SKU-level reason coding and net recovery analysis.",
      refundTodo:
        "TODO: Integrate product cost inputs, refund reasons, and recovered-value logic once real product cost and returns data are available.",
      product: "Product",
      collection: "Collection",
      units: "Units",
      revenue: "Revenue",
      discount: "Discount Impact",
      refunds: "Refund Impact",
      estimatedProfit: "Estimated Profit",
      discountCode: "Discount",
      orders: "Orders",
      influencedRevenue: "Revenue Influenced",
      discountAmount: "Discount Amount",
      topProductCopy: "revenue and",
      topProductCopyEnd: "estimated profit.",
      watchlistCopy: "estimated profit with",
      watchlistCopyEnd: "discount drag.",
      tips: {
        page: "Profit = Revenue − Discounts − Refunds − Estimated COGS. Configure the cost model in Settings if you want exact margins.",
        salesByProduct: "Revenue contribution per top SKU. Useful for spotting which products are doing the heavy lifting.",
        profitByCollection: "Estimated profit grouped by collection. Lets you see which catalog buckets are carrying margin.",
        productTable: "Per-product breakdown of units, revenue, discount drag, refund drag, and estimated profit.",
        watchlist: "Products with the lowest estimated profit or highest discount drag. Likely candidates for repricing, bundling, or removing promo codes.",
        bundleImpact: "Will display contribution from bundle/kit SKUs once Shopify line-item metadata is connected.",
        refundImpact: "Will display refund reasons and net recovered value once return data is wired in.",
        discountCol: "Total markdown applied to this product across orders in the window — high values eat into margin.",
        refundsCol: "Refunded amount tied to this product. Spikes here usually point to fit, quality, or fulfilment problems."
      }
    },
    retention: {
      eyebrow: "Retention Analytics",
      title: "Customer quality and second-order behavior",
      description:
        "The retention layer is built around first orders, second orders, and returning customer signals so the service can evolve into a genuine operator workflow rather than a shallow repeat-rate widget.",
      newCustomers: "New customers",
      returningCustomers: "Returning customers",
      repeatPurchaseRate: "Repeat purchase rate",
      secondOrderRate: "Second-order rate",
      avgDaysToSecondOrder: "Avg days to second order",
      repeatRateOverTime: "Repeat purchase rate over time",
      newVsReturning: "New vs returning customers",
      newVsReturningDescription: "Current reporting window mix.",
      topFirstOrderProducts: "Top products in first orders",
      topSecondOrderProducts: "Top products in second orders",
      topSecondOrderDescription:
        "The codebase models second-order analysis as a first-class concept for future automation.",
      cohortView: "Cohort view",
      cohortDescription:
        "Placeholder section for real cohort retention once order-event histories are connected.",
      avgTimeBetweenOrders: "Average time between first and second order",
      avgTimeDescription:
        "Placeholder for distribution analysis and lifecycle benchmarking.",
      avgTimeTodo:
        "TODO: Use Shopify order timelines plus AI summary generation to surface lifecycle opportunities and second-order drop-off risk automatically.",
      newLabel: "New",
      returningLabel: "Returning",
      tips: {
        page: "Retention is what compounds — second orders, repeat rate, and time-to-second-order tell you whether the store has real lifetime value.",
        newCustomers: "Customers who placed their very first order in this window.",
        returningCustomers: "Customers in this window who already had at least one prior order.",
        repeatRate: "Share of customers who have placed more than one lifetime order. Higher = stickier brand.",
        secondOrderRate: "Of customers whose first order falls in the window, what % came back for a second one.",
        avgDaysToSecond: "Average days between a customer's first and second order. Shorter = faster lifecycle.",
        repeatRateChart: "Daily returning-customer share. Watch for downward trends — they precede LTV problems.",
        newVsReturning: "Mix of new vs. returning customers in the current window. A healthy DTC mix is usually 30–50% returning.",
        topFirstOrder: "Products customers buy first — your best acquisition SKUs.",
        topSecondOrder: "Products customers come back for — your best retention SKUs.",
        cohort: "Reserved for true cohort retention curves once order history is fully connected.",
        avgTime: "Reserved for distribution analysis (median, p90) of first → second order lag."
      }
    },
    weeklySummary: {
      eyebrow: "Founder Weekly Summary",
      title: "An executive readout built for operating decisions",
      description:
        "A concise weekly narrative designed to be generated by an LLM service later, but already structured as a durable summary contract.",
      regenerate: "Regenerate summary",
      copy: "Copy summary",
      share: "Email / share",
      generatedAt: "Generated",
      generationTitle: "Weekly summary generation",
      generationTodo:
        "TODO: Replace the current summary scaffolding with AI summary generation that uses real reporting deltas, profit context, and retention insights.",
      deliveryTitle: "Delivery orchestration",
      deliveryTodo:
        "TODO: Add email, WhatsApp, and Slack notification adapters for scheduled founder digests and alerts.",
      dependenciesTitle: "Store data dependencies",
      dependenciesTodo:
        "TODO: Complete Shopify OAuth and Shopify Admin API ingestion so summaries can operate on fresh store-level data."
    },
    alertsPage: {
      eyebrow: "Alerts Center",
      title: "Useful signals, not notification noise",
      description:
        "Alerts currently come from deterministic rules, and the architecture is ready for a richer engine that evaluates discount spikes, retention drops, refund pressure, and outlier growth.",
      suggestedAction: "Suggested action",
      severity: {
        low: "Low",
        medium: "Medium",
        high: "High"
      },
      tips: {
        page: "Each alert is a rule-triggered signal that something material moved. Severity reflects how urgently a founder should look at it.",
        severity: "High = act today. Medium = check this week. Low = informational, review during weekly planning."
      }
    },
    settings: {
      eyebrow: "Settings",
      title: "Store connection and operating defaults",
      description:
        "A lightweight settings surface with real Shopify connection, sync controls, and clean seams for future OAuth, notifications, and profit model controls.",
      reportingTitle: "Reporting and cost settings",
      reportingDescription:
        "Defaults that shape founder reporting and estimated profit math.",
      futureTitle: "Future integrations",
      languageTitle: "Language",
      languageDescription:
        "Choose the app language for navigation, shared UI controls, and settings.",
      english: "English",
      hebrew: "Hebrew",
      dateRange: "Date range",
      currency: "Currency",
      estimatedCostMode: "Estimated cost mode",
      defaultCostRatio: "Default cost ratio",
      compareToPreviousPeriod: "Compare-to-previous-period",
      enabled: "Enabled",
      oauthTodo:
        "TODO: Add Shopify OAuth install flow and webhook registration for production distribution.",
      costTodo:
        "Product costs (COGS) are now editable per product and via CSV on the Profit → Product costs page.",
      notificationsTodo:
        "TODO: Add email, WhatsApp, and Slack delivery preferences for summaries and alerts.",
      shopify: {
        title: "Shopify connection",
        description: "Use a custom app Admin API token in Phase A. Tokens stay server-side only.",
        shopDomain: "Shop domain",
        shopDomainPlaceholder: "example.myshopify.com",
        token: "Admin API access token (optional)",
        tokenHelp:
          "Leave the token empty to use SHOPIFY_CLIENTID and SHOPIFY_CLIENT_SECRET from .env. If you paste a token here, it overrides .env auth and must be a valid Shopify Admin API token.",
        tokenPlaceholder: "Leave blank to use client credentials",
        testConnection: "Test connection",
        testing: "Testing...",
        saveCredentials: "Save credentials",
        saving: "Saving...",
        testSuccess: "Connection test succeeded for",
        saveSuccess: "Shopify credentials saved successfully.",
        connectionFailed: "Connection test failed.",
        saveFailed: "Saving connection failed.",
        unexpectedError: "Something went wrong.",
        notConnected: "Not connected",
        syncRunning: "Sync running",
        connected: "Connected",
        connectionState: "Connection state",
        lastSync: "Last sync",
        noSyncYet: "No sync has run yet.",
        syncControlsTitle: "Sync controls",
        syncControlsDescription:
          "Initial sync loads historical data. Incremental sync only pulls records updated since the last successful run.",
        runInitialSync: "Run initial sync",
        runningInitialSync: "Running initial sync...",
        runIncrementalSync: "Run incremental sync",
        runningIncrementalSync: "Running incremental sync...",
        initialSyncDone: "Initial sync completed.",
        incrementalSyncDone: "Incremental sync completed.",
        initialSyncFailed: "Initial sync failed.",
        incrementalSyncFailed: "Incremental sync failed.",
        noSyncRuns: "No sync runs yet.",
        created: "Created",
        updated: "Updated",
        failed: "Failed",
        syncModes: {
          initial: "Initial",
          incremental: "Incremental"
        },
        syncStatuses: {
          idle: "Idle",
          running: "Running",
          success: "Success",
          error: "Error"
        }
      }
    },
    creator: {
      eyebrow: "Creator Commerce",
      title: "Instagram and creator-driven sales in one operating view",
      description:
        "This niche expands the product into creator commerce: Instagram post engagement, creator content performance, and internal sales attribution in one founder-friendly workflow.",
      postsAnalyzed: "Posts analyzed",
      likes: "Likes",
      comments: "Comments",
      views: "Views",
      attributedSales: "Attributed sales",
      engagementRate: "Engagement rate",
      topPostsTitle: "Top posts by attributed sales",
      topPostsDescription:
        "Combine post engagement with sales attribution to see which creator assets are driving commercial value.",
      engagementTitle: "Post engagement by views",
      engagementDescription:
        "Use this view to spot posts with strong attention that are under-converting into sales.",
      tableTitle: "Creator post performance",
      tableDescription:
        "Recent Instagram posts with engagement and attributed-sales context.",
      post: "Post",
      type: "Type",
      sales: "Sales",
      orders: "Orders",
      instagramConnectionTitle: "Instagram creator connection",
      instagramConnectionDescription:
        "Connect a professional Instagram account token so we can fetch recent posts and analyze likes, comments, views, and attributed sales.",
      instagramToken: "Instagram access token",
      connectInstagram: "Connect with token",
      connectInstagramOauth: "Connect with Instagram",
      connecting: "Connecting...",
      syncLatestPosts: "Sync latest posts",
      syncing: "Syncing...",
      instagramConnected: "Instagram account connected.",
      instagramSynced: "Instagram posts synced.",
      attributionTitle: "Creator attribution settings",
      attributionDescription:
        "Configure the internal attribution workspace for creator links, coupon tracking, and sales mapping inside this niche.",
      attributionDomain: "Attribution workspace domain",
      attributionDomainPlaceholder: "creators.yourbrand.com",
      attributionKey: "Workspace API key",
      optionalForNow: "Optional for now",
      saveAttribution: "Save attribution settings",
      saving: "Saving...",
      attributionSaved: "Creator attribution settings saved.",
      requestFailed: "Request failed.",
      oauthHelp: "Use the Instagram button for a guided login flow, or paste a token manually if you already have one."
    }
  },
  he: {
    common: {
      appName: "Hiloomy",
      menu: "תפריט",
      connectedStore: "חנות מחוברת",
      storeSetup: "הגדרת חנות",
      exportSummary: "ייצוא סיכום",
      last30Days: "30 הימים האחרונים",
      compareToPriorPeriod: "השוואה לתקופה קודמת",
      automationReady: "מוכן לאוטומציה",
      automationCopy:
        "סיכומים שבועיים, תהליכי שליחה והתראות מבוססות חוקים בנויים כך שאפשר להרחיב אותם בהמשך לשירות מלא.",
      founderAnalyticsCopy:
        "אנליטיקה ברורה למייסדים ולמפעילים סביב רווחיות, שימור לקוחות והחלטות תפעול שבועיות.",
      shellHeroCopy:
        "בהירות ברווחיות, שיפור בשימור לקוחות ודיווח שבועי שמוביל לפעולה."
    },
    nav: {
      overview: "סקירה",
      profit: "רווחיות",
      retention: "שימור לקוחות",
      creatorFlow: "יוצרים ומכירות",
      weeklySummary: "סיכום שבועי",
      alerts: "התראות",
      settings: "הגדרות"
    },
    overview: {
      eyebrow: "סקירה",
      title: "מערכת החלטה ברורה לקצב העבודה של המייסד",
      description:
        "תמונה אחת שמסבירה מה השתנה, למה זה חשוב, ואיפה צריך לשים לב לרווחיות ולשימור לקוחות.",
      comparisonTitle: "השוואה לתקופה קודמת",
      comparisonDescription:
        "קונטקסט מהיר מול חלון הדיווח הקודם כדי להבין אם הצמיחה באמת מתורגמת לכלכלה בריאה יותר.",
      revenueProfitTrend: "מגמת הכנסות ורווח משוער",
      returningTrend: "מגמת שיעור הלקוחות החוזרים",
      insightsTitle: "תובנות מרכזיות",
      insightsDescription:
        "פרשנות ברמת מייסד, לא עוד קיר של וידג'טים מנותקים.",
      actionsTitle: "פעולות תפעוליות",
      actionsDescription:
        "מה השתנה השבוע, מה דורש תשומת לב, ואיך לפעול בלי לרדוף אחרי כמה דשבורדים.",
      topProductPerformance: "ביצועי המוצרים המובילים",
      topProductDescription:
        "תרומת מוצרים עם מודל רווחיות שנבנה להתרחב בהמשך לעלות אמיתית.",
      product: "מוצר",
      collection: "קטגוריה",
      units: "יחידות",
      revenue: "הכנסות",
      estimatedProfit: "רווח משוער",
      alertsPreviewTitle: "התראות שדורשות תשומת לב",
      changeLabel: "לעומת התקופה הקודמת",
      priorLabel: "קודם",
      tips: {
        page: "כל המספרים בעמוד הזה משווים את חלון הדיווח שבחרתם לחלון זהה לפניו.",
        kpis: "מדדי המפתח של החנות. הצ'יפ מציג שינוי באחוזים מול התקופה הקודמת — ירוק עלייה, אדום ירידה.",
        comparison: "ערכי מדד ליד התקופה הקודמת, כדי לוודא שהצמיחה אכן משפרת רווחיות ולא רק הכנסות.",
        revenueChart: "הכנסות יומיות (ברוטו) על גבי רווח משוער (הכנסות בניכוי הנחות, החזרים ועלות מוצר).",
        retentionChart: "אחוז ההזמנות היומיות שמגיעות מלקוחות חוזרים. גבוה = שימור לקוחות בריא.",
        insights: "תקצירים בסגנון AI שמתרגמים מספרים לאמירה אחת שאפשר לפעול עליה.",
        actions: "משימות תפעוליות לפי נושא — תמחור, שימור לקוחות, מלאי, תוכן.",
        topProducts: "5 המוצרים המובילים בתקופה לפי הכנסות. שדה 'רווח משוער' משתמש במודל העלות שהגדרתם בהגדרות.",
        alerts: "ההתראות העדכניות ביותר. לחיצה תוביל למסך ההתראות המלא."
      },
      colTips: {
        units: "סה\"כ יחידות שנמכרו מהמוצר בתקופה הנבחרת.",
        revenue: "הכנסה ברוטו מהמוצר לפני החזרים ועמלות.",
        profit: "הכנסה פחות הנחות, החזרים ועלות מוצר משוערת. קירוב עד שיחובר נתון עלות אמיתי."
      }
    },
    profit: {
      eyebrow: "אנליטיקת רווחיות",
      title: "ביצועים עם מודעות למרווח עבור מייסדים ומפעילים",
      description:
        "הרווח המשוער מחושב כהכנסות פחות הנחות, החזרים ועלות משוערת, כך שניתן יהיה לחבר בעתיד עלות מוצר אמיתית בלי לשכתב את החוויה.",
      salesByProduct: "מכירות לפי מוצר",
      salesByProductDescription: "הSKU (יחידת מלאי / Stock Keeping Unit) המובילים לפי תרומת הכנסות.",
      profitByCollection: "רווח משוער לפי קטגוריה",
      profitByCollectionDescription: "אילו קטגוריות מחזיקות את מרווח התרומה.",
      productTable: "טבלת רווחיות ברמת מוצר",
      productTableDescription:
        "בנוי כך שיוכל לקלוט בהמשך נתוני עלות אמיתיים מShopify או מERP.",
      salesByCollection: "מכירות לפי קטגוריה",
      discountImpact: "השפעת הנחות",
      topProducts: "המוצרים החזקים ביותר",
      watchlistProducts: "מוצרים למעקב",
      watchlistDescription:
        "מוצרים עם רווחיות נמוכה שכנראה דורשים בדיקת תמחור, באנדלים או החזרים.",
      bundleImpact: "השפעת באנדלים",
      bundleDescription:
        "אזור שמור לניתוח תרומת באנדלים כאשר יתחבר ייחוס קיטים.",
      bundleTodo:
        "TODO: להוסיף קליטה של הרכב באנדלים, מטא דאטה של שורות הזמנה והעשרת הזמנות לפני שמדליקים דיווח תרומת באנדלים.",
      refundImpact: "השפעת החזרים והחזרות",
      refundDescription:
        "אזור שמור לניתוח סיבות החזרה וערך נטו שנשמר.",
      refundTodo:
        "TODO: לשלב עלויות מוצר, סיבות החזר ולוגיקת ערך משוחזר כשיהיו נתוני עלות והחזרות אמיתיים.",
      product: "מוצר",
      collection: "קטגוריה",
      units: "יחידות",
      revenue: "הכנסות",
      discount: "פגיעת הנחה",
      refunds: "פגיעת החזר",
      estimatedProfit: "רווח משוער",
      discountCode: "קוד הנחה",
      orders: "הזמנות",
      influencedRevenue: "הכנסה מושפעת",
      discountAmount: "סכום הנחה",
      topProductCopy: "הכניס",
      topProductCopyEnd: "ורווח משוער.",
      watchlistCopy: "רווח משוער עם",
      watchlistCopyEnd: "שחיקת הנחות.",
      tips: {
        page: "רווח = הכנסות − הנחות − החזרים − עלות מוצר משוערת. אפשר לכוון את מודל העלות במסך הגדרות.",
        salesByProduct: "תרומת ההכנסות לפי SKU. עוזר לזהות אילו מוצרים נושאים את החנות.",
        profitByCollection: "רווח משוער בקיבוץ לפי קטגוריה. רואים איזו קטגוריה מחזיקה את המרווח.",
        productTable: "פירוט ברמת מוצר: יחידות, הכנסה, פגיעת הנחה, פגיעת החזר ורווח משוער.",
        watchlist: "מוצרים עם הרווח הנמוך ביותר או פגיעת הנחה גבוהה. מועמדים לתמחור מחדש או הסרת הנחות.",
        bundleImpact: "יציג תרומת באנדלים כשתחובר מטא דאטה של line items מShopify.",
        refundImpact: "יציג סיבות להחזר וערך נשמר נטו כשנתוני ההחזרות יחוברו.",
        discountCol: "סכום ההנחה שניתנה למוצר בחלון הזמן — ערכים גבוהים שוחקים את המרווח.",
        refundsCol: "סכום ההחזר שיוחס למוצר. עלייה כאן בדרך כלל מצביעה על בעיית התאמה, איכות או שילוח."
      }
    },
    retention: {
      eyebrow: "אנליטיקת שימור לקוחות",
      title: "איכות לקוחות והתנהגות של הזמנה שנייה",
      description:
        "שכבת שימור הלקוחות בנויה סביב הזמנה ראשונה, הזמנה שנייה ולקוחות חוזרים, כדי להפוך את המוצר לכלי תפעולי אמיתי ולא רק וידג'ט שטחי של רכישה חוזרת.",
      newCustomers: "לקוחות חדשים",
      returningCustomers: "לקוחות חוזרים",
      repeatPurchaseRate: "שיעור רכישה חוזרת",
      secondOrderRate: "שיעור הזמנה שנייה",
      avgDaysToSecondOrder: "ממוצע ימים להזמנה שנייה",
      repeatRateOverTime: "שיעור רכישה חוזרת לאורך זמן",
      newVsReturning: "חדשים מול חוזרים",
      newVsReturningDescription: "התמהיל בחלון הדיווח הנוכחי.",
      topFirstOrderProducts: "המוצרים המובילים בהזמנה ראשונה",
      topSecondOrderProducts: "המוצרים המובילים בהזמנה שנייה",
      topSecondOrderDescription:
        "הקוד מתייחס לניתוח הזמנה שנייה כקונספט מרכזי כדי לאפשר אוטומציה בהמשך.",
      cohortView: "תצוגת קוהורטים",
      cohortDescription:
        "אזור שמור לניתוח קוהורטים אמיתי כאשר היסטוריית האירועים של ההזמנות תהיה מחוברת.",
      avgTimeBetweenOrders: "זמן ממוצע בין הזמנה ראשונה לשנייה",
      avgTimeDescription:
        "אזור שמור לניתוח התפלגות ובנצ'מרקים של מחזור חיים.",
      avgTimeTodo:
        "TODO: להשתמש בציר הזמן של הזמנות Shopify ובשכבת הסיכום כדי לזהות אוטומטית הזדמנויות להזמנה שנייה וסיכון לירידה.",
      newLabel: "חדשים",
      returningLabel: "חוזרים",
      tips: {
        page: "שימור לקוחות הוא מה שמצטבר — הזמנה שנייה, רכישה חוזרת וזמן עד הזמנה שנייה מספרים אם לחנות יש אורך חיים לקוח אמיתי.",
        newCustomers: "לקוחות שביצעו את ההזמנה הראשונה שלהם בחלון הזמן הזה.",
        returningCustomers: "לקוחות שכבר הייתה להם הזמנה אחת קודמת לפחות.",
        repeatRate: "אחוז הלקוחות עם יותר מהזמנה אחת אי פעם. גבוה = מותג דביק.",
        secondOrderRate: "מתוך מי שהזמינו לראשונה בחלון, כמה חזרו להזמנה שנייה.",
        avgDaysToSecond: "ממוצע ימים בין הזמנה ראשונה לשנייה. קצר יותר = מחזור חיים מהיר יותר.",
        repeatRateChart: "אחוז יומי של לקוחות חוזרים. ירידות כאן בדרך כלל מקדימות בעיות אורך חיים לקוח.",
        newVsReturning: "התמהיל בין לקוחות חדשים לחוזרים בחלון הנוכחי. מותג DTC (מכירה ישירה לצרכן / Direct to Consumer) בריא בדרך כלל מציג 30%-50% חוזרים.",
        topFirstOrder: "המוצרים שלקוחות קונים ראשונים — נקודות הכניסה הטובות ביותר.",
        topSecondOrder: "המוצרים שלקוחות חוזרים אליהם — מנועי שימור הלקוחות.",
        cohort: "אזור שמור לעקומות שימור לקוחות אמיתיות לפי קוהורט כשההיסטוריה תחובר במלואה.",
        avgTime: "אזור שמור להתפלגות (חציון, p90 — אחוזון 90 / 90th percentile) של פער הזמן בין הזמנה ראשונה לשנייה."
      }
    },
    weeklySummary: {
      eyebrow: "סיכום שבועי למייסד",
      title: "קריאה ניהולית מהירה שמיועדת להחלטות",
      description:
        "נרטיב שבועי קצר ומנהלי, בנוי כך שבהמשך יוכל להגיע מLLM אבל כבר עכשיו נשען על מבנה סיכום יציב.",
      regenerate: "יצירת סיכום מחדש",
      copy: "העתקת סיכום",
      share: "אימייל / שיתוף",
      generatedAt: "נוצר בתאריך",
      generationTitle: "יצירת סיכום שבועי",
      generationTodo:
        "TODO: להחליף את הסיכומים המדומים ביצירת סיכום AI שמבוססת על דלתאות אמיתיות, רווחיות ושימור לקוחות.",
      deliveryTitle: "אורקסטרציית שליחה",
      deliveryTodo:
        "TODO: להוסיף ערוצי שליחה במייל, בוואטסאפ ובסלאק עבור סיכומים והתראות.",
      dependenciesTitle: "תלויות נתוני חנות",
      dependenciesTodo:
        "TODO: להשלים OAuth של Shopify וקליטת נתונים כדי שהסיכומים יעבדו על נתוני חנות טריים ולא על מוקים."
    },
    alertsPage: {
      eyebrow: "מרכז התראות",
      title: "איתותים שימושיים, לא רעש",
      description:
        "ההתראות עדיין מבוססות חוקים פשוטים, אבל המבנה כבר מוכן למנוע כללים שיזהה עלייה בהנחות, ירידה בשימור לקוחות, לחץ מהחזרים וצמיחה חריגה.",
      suggestedAction: "פעולה מומלצת",
      severity: {
        low: "נמוכה",
        medium: "בינונית",
        high: "גבוהה"
      },
      tips: {
        page: "כל התראה היא איתות שמשהו מהותי זז. החומרה משקפת עד כמה דחוף לטפל.",
        severity: "גבוהה = לטפל היום. בינונית = לבדוק השבוע. נמוכה = לידיעה, לסקירה בתכנון השבועי."
      }
    },
    settings: {
      eyebrow: "הגדרות",
      title: "חיבור החנות וברירות המחדל של התפעול",
      description:
        "מסך הגדרות קל עם חיבור Shopify אמיתי, בקרות סנכרון ותשתית מסודרת להרחבה עתידית.",
      reportingTitle: "הגדרות דיווח ועלות",
      reportingDescription:
        "ברירות המחדל שמעצבות את הדיווח למייסד ואת חישוב הרווח המשוער.",
      futureTitle: "אינטגרציות עתידיות",
      languageTitle: "שפה",
      languageDescription:
        "בחירת שפת המערכת לניווט, רכיבי הממשק המשותפים ומסך ההגדרות.",
      english: "English",
      hebrew: "עברית",
      dateRange: "טווח תאריכים",
      currency: "מטבע",
      estimatedCostMode: "שיטת עלות משוערת",
      defaultCostRatio: "יחס עלות ברירת מחדל",
      compareToPreviousPeriod: "השוואה לתקופה קודמת",
      enabled: "פעיל",
      oauthTodo:
        "TODO: להוסיף התקנת Shopify דרך OAuth (התחברות מאובטחת) ורישום Webhooks (עדכונים אוטומטיים בזמן אמת) להפצה אמיתית.",
      costTodo:
        "עלויות מוצרים (COGS / Cost of Goods Sold) ניתנות כעת לעריכה לכל מוצר ודרך CSV בעמוד רווחיות → עלויות מוצרים.",
      notificationsTodo:
        "TODO: להוסיף העדפות שליחה במייל, וואטסאפ וסלאק לסיכומים ולהתראות.",
      shopify: {
        title: "חיבור Shopify",
        description: "שימוש בטוקן Admin API (ממשק הניהול של Shopify) של אפליקציה פרטית בשלב זה. הטוקנים נשמרים רק בצד השרת.",
        shopDomain: "דומיין החנות",
        shopDomainPlaceholder: "example.myshopify.com",
        token: "טוקן גישה של Admin API",
        tokenPlaceholder: "shpat_...",
        testConnection: "בדיקת חיבור",
        testing: "בודק…",
        saveCredentials: "שמירת פרטי גישה",
        saving: "שומר…",
        testSuccess: "בדיקת החיבור הצליחה עבור",
        saveSuccess: "פרטי הגישה לShopify נשמרו בהצלחה.",
        connectionFailed: "בדיקת החיבור נכשלה.",
        saveFailed: "שמירת החיבור נכשלה.",
        unexpectedError: "משהו השתבש.",
        notConnected: "לא מחובר",
        syncRunning: "סנכרון פעיל",
        connected: "מחובר",
        connectionState: "מצב חיבור",
        lastSync: "סנכרון אחרון",
        noSyncYet: "עדיין לא בוצע סנכרון.",
        syncControlsTitle: "בקרות סנכרון",
        syncControlsDescription:
          "סנכרון ראשוני טוען היסטוריה רחבה. סנכרון אינקרמנטלי מושך רק רשומות שעודכנו מאז הריצה האחרונה.",
        runInitialSync: "הרצת סנכרון ראשוני",
        runningInitialSync: "מריץ סנכרון ראשוני…",
        runIncrementalSync: "הרצת סנכרון אינקרמנטלי",
        runningIncrementalSync: "מריץ סנכרון אינקרמנטלי…",
        initialSyncDone: "הסנכרון הראשוני הושלם.",
        incrementalSyncDone: "הסנכרון האינקרמנטלי הושלם.",
        initialSyncFailed: "הסנכרון הראשוני נכשל.",
        incrementalSyncFailed: "הסנכרון האינקרמנטלי נכשל.",
        noSyncRuns: "עדיין אין ריצות סנכרון.",
        created: "נוצרו",
        updated: "עודכנו",
        failed: "נכשלו",
        syncModes: {
          initial: "ראשוני",
          incremental: "אינקרמנטלי"
        },
        syncStatuses: {
          idle: "ממתין",
          running: "רץ",
          success: "הושלם",
          error: "שגיאה"
        }
      }
    },
    creator: {
      eyebrow: "יוצרים ומכירות",
      title: "אינסטגרם וייחוס מכירות ליוצרים בתצוגה אחת",
      description:
        "הנישה הזו מרחיבה את המוצר לעולמות creator commerce: מעורבות פוסטים, ביצועי תוכן וייחוס מכירות פנימי בתוך זרימת עבודה אחת ונוחה למייסד.",
      postsAnalyzed: "פוסטים שנותחו",
      likes: "לייקים",
      comments: "תגובות",
      views: "צפיות",
      attributedSales: "מכירות משויכות",
      engagementRate: "שיעור מעורבות",
      topPostsTitle: "הפוסטים המובילים לפי מכירות משויכות",
      topPostsDescription:
        "שילוב בין מעורבות תוכן לייחוס מכירות כדי להבין אילו נכסים של יוצרים באמת מניעים ערך.",
      engagementTitle: "מעורבות פוסטים לפי צפיות",
      engagementDescription:
        "תצוגה שמדגישה פוסטים שמקבלים תשומת לב אבל עדיין לא ממירים טוב מספיק למכירות.",
      tableTitle: "ביצועי פוסטים של יוצרים",
      tableDescription:
        "פוסטים אחרונים מאינסטגרם עם הקשר של מעורבות וייחוס מכירות.",
      post: "פוסט",
      type: "סוג",
      sales: "מכירות",
      orders: "הזמנות",
      instagramConnectionTitle: "חיבור חשבון אינסטגרם מקצועי",
      instagramConnectionDescription:
        "חברו טוקן של אינסטגרם כדי למשוך פוסטים אחרונים ולנתח לייקים, תגובות, צפיות ומכירות משויכות.",
      instagramToken: "טוקן גישה לאינסטגרם",
      connectInstagram: "חיבור באמצעות טוקן",
      connectInstagramOauth: "חיבור עם Instagram",
      connecting: "מתחבר…",
      syncLatestPosts: "סנכרון פוסטים אחרונים",
      syncing: "מסנכרן…",
      instagramConnected: "חשבון האינסטגרם חובר.",
      instagramSynced: "פוסטים מאינסטגרם סונכרנו.",
      attributionTitle: "הגדרות ייחוס מכירות ליוצרים",
      attributionDescription:
        "הגדירו סביבת עבודה פנימית לייחוס לינקים, קופונים ומכירות של יוצרים בתוך הנישה הזו.",
      attributionDomain: "דומיין סביבת ייחוס",
      attributionDomainPlaceholder: "creators.yourbrand.com",
      attributionKey: "מפתח API של סביבת הייחוס",
      optionalForNow: "אופציונלי כרגע",
      saveAttribution: "שמירת הגדרות ייחוס",
      saving: "שומר…",
      attributionSaved: "הגדרות ייחוס המכירות נשמרו.",
      requestFailed: "הבקשה נכשלה.",
      oauthHelp: "השתמשו בכפתור Instagram לתהליך התחברות מודרך, או הדביקו טוקן ידנית אם כבר יש לכם אחד."
    }
  }
} as const;

export function isValidLocale(value: string): value is AppLocale {
  return value === "en" || value === "he";
}

export async function getAppLocale(): Promise<AppLocale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return value && isValidLocale(value) ? value : "he";
}

export function getDictionary(locale: AppLocale) {
  return dictionaries[locale];
}

export function getLocaleDirection(locale: AppLocale) {
  return locale === "he" ? "rtl" : "ltr";
}

export const APP_LOCALE_COOKIE = LOCALE_COOKIE;
