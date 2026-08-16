# Hebrew Localization Triage Report — 2026-06-16

**Headline:** 351 high-severity and 45 medium-severity untranslated strings
across 13 surfaces — Hebrew coverage is broken in nearly every section.
The worst offenders are **Growth Agent, Marketing Planner, Weekly Summary,
Product Follow-ups, and Settings (Meta Ads)**, where entire pages render in
English regardless of locale.

The single most impactful fix: **Affiliate Portal hardcodes
`localeOverride="en"`** at [app/affiliate-portal/page.tsx:40](../app/affiliate-portal/page.tsx#L40),
which forces the entire portal to English. One-line removal.

---

## By Surface

### Overview (`app/page.tsx`)
- `components/dashboard-v2/revenue-chart-v2.tsx:55,70` — "Revenue" / "Estimated profit" / `en-US` formatter
- `components/dashboard-v2/enriched-revenue-chart.tsx:249` — `en-US` formatter
- `components/dashboard-v2/stock-badge.tsx:48-55` — "Not tracked" / "Critical" / "Low" / "Healthy"
- `components/dashboard-v2/kpi-tile.tsx:23-56` — 12 hardcoded KPI hints/tooltips
- `components/dashboard-v2/collection-chips.tsx:39,45` — "+N more" / "All collections (N)"
- `components/dashboard-v2/styled-table.tsx:25` — "No data available yet."

### Retention (`app/retention/page.tsx`)
- **The entire page is hardcoded English.** Step eyebrows, SectionHead titles/hints, StatTile hints, tone labels, narrative banner templates, chart tooltips. Build full `dictionary.retention.*`.
- `components/dashboard-v2/retention-line-chart.tsx:50` — "Returning customers"

### Profit (`app/profit/page.tsx`)
- Lines 65-77, 148-150, 261-263, 337-339 — every eyebrow/title/hint hardcoded
- Tone labels ("Profit positive", "Margin pressure"), table headers, empty state
- Line 169 — collection tooltip

### Profit costs
- `components/profit/product-costs-editor.tsx:213` — "CSV" fallback

### Sales summary
- `components/ui/help-tip.tsx:66` — "Show more info" aria-label (leaks into every page that uses HelpTip)
- `components/sales-summary/sales-summary-panel.tsx:979-1107` — "Online"/"Offline"/"Halo ratio"

### Weekly summary (`app/weekly-summary/page.tsx`)
- ~40 hardcoded strings — titles, metric labels (Period/Sales/Orders/Clicks/Active creators), section headings (Creators to scale/check/pause), empty states, agent insights labels
- `components/shared/instagram-crawl-evidence-panel.tsx` — ~20 strings
- `components/shared/meta-ads-intelligence-panel.tsx` — ~25 strings
- `components/dashboard-v2/narrative-banner.tsx:58` — "Trending up/down"

### Product follow-ups (`app/product-follow-ups/page.tsx`)
- ~40 strings — table columns + tooltips, page header, 4 StatTile labels + tooltips, all 5 step eyebrows, all section titles, dynamic narrative banner, instructional copy

### Alerts (`app/alerts/page.tsx`)
- Dynamic narrative headline, tone pills, priority section trios, empty state
- `components/dashboard-v2/alert-card.tsx:47` — "Suggested action" (dictionary key exists, just not wired)

### Marketing planner (`components/marketing-planner/brief-studio.tsx`)
- ~60 strings: DataReadinessCard, DiscountDiagnosticsCard, DiscountProposalsCard, CustomerVoiceCard, InfluencerIntelligenceCard, Instagram + Meta Ads sections (duplicated from shared panels)
- Line 1416 — mixed Hebrew/English label

### Growth agent (`app/growth-agent/`)
- **Entire surface in English.** Page header, all section eyebrows/titles, activity card
- `agent-nav.tsx:8-14` — 7 nav tabs
- `monitoring-grid.tsx`, `action-center.tsx`, `manual-controls.tsx`, `product-recommendations-panel.tsx`, `connections-panel.tsx`, `findings-list.tsx` — all components

### Settings (`app/settings/page.tsx` + connection managers)
- Page-level: "Setup status", body copy, "Connected/Action needed" tone, Step 1
- `components/settings/meta-ads-connection-manager.tsx` — **entire form is English** (~35 strings: every input label, helper text, button, loading state, date preset, status label, error message)
- `components/settings/creator-connections-manager.tsx:164-180` — Instagram crawler section

### Affiliate portal
- **`app/affiliate-portal/page.tsx:40` — `localeOverride="en"` forces entire page to English.** Remove this override.
- `portal-nav.tsx:7-15` — 8 nav tabs
- `components/shared/data-table-paginated.tsx:130,166` — "Rows per page" / "Page X of Y" (affects every paginated table app-wide)
- `affiliate-attribution-sync-button.tsx:29-36` — sync toasts
- `affiliate-trend-chart.tsx:21` — Hebrew labels hardcoded (inverse — should be localized)

### Creative / Topbar
- `components/layout/reporting-picker.tsx:25-630` — **all date presets, comparison modes, sync messages, "Cancel/Apply/Custom range"**, and `en-US` formatter. This picker is in the global Topbar — it leaks English into every page.
- `components/layout/store-switcher.tsx:75-156` — "Connect another brand", error messages

---

## Patterns — fix once, fix many

### A. Shared components with English defaults
`NarrativeBanner` ("Trending up/down"), `HelpTip` ("Show more info"),
`StockBadge` (Critical/Low/Healthy/Not tracked), `StyledTable` ("No data
available yet."), `DataTablePaginated` ("Rows per page / Page X of Y").
Every page that uses these inherits English.
**Fix:** make these components locale-aware (accept `locale` prop or read
from a context) and require localized strings from callers — no English fallbacks.

### B. Chart libraries default to `en-US`
`revenue-chart-v2.tsx`, `enriched-revenue-chart.tsx`,
`reporting-picker.tsx:87` all hardcode `en-US` in `Intl.NumberFormat` /
`toLocaleString`.
**Fix:** central helper `formatNumber(value, locale)` that returns `he-IL`
when locale=he. Audit every Intl call.

### C. Step eyebrows / SectionHead trios
Retention, Profit, Product Follow-ups, Alerts, Settings, Weekly Summary
all use `<SectionHead eyebrow="Step N" title="..." hint="..." />` with
raw English. Repeated everywhere.
**Fix:** add `dictionary.common.stepN`; ban raw English in SectionHead.

### D. Duplicated panels
`instagram-crawl-evidence-panel.tsx` + `meta-ads-intelligence-panel.tsx`
are also reimplemented inside `brief-studio.tsx` (lines 630-1033).
**Fix:** delete brief-studio copies, reuse shared components once they're
localized — fixes ~45 strings in one shot.

### E. Toast/error messages
Growth Agent action-center, affiliate sync button, Meta Ads connection
manager all emit English toasts.
**Fix:** route every toast through a `t(key)` helper; ban raw string
literals in `toast.success`/`toast.error`.

### F. `localeOverride="en"` is a kill switch
Affiliate portal uses it. Grep for others.
**Fix:** remove unless documented.

### G. Topbar leaks English everywhere
`reporting-picker.tsx` and `store-switcher.tsx` sit in every page's
chrome but are entirely English. **Fixing these two files alone removes
English from the most-seen UI surface.**

### H. Missing dictionary sections
`dictionary.retention`, `dictionary.profit`, `dictionary.productFollowUps`,
`dictionary.growthAgent`, `dictionary.weeklySummary`, `dictionary.metaAds`,
`dictionary.alertsPage` are largely missing from `lib/i18n.ts`.
**Recommend:** one PR scaffolds all missing dictionary sections; follow-up
PRs per surface wire the strings.

---

## Recommended order of attack

1. **Quick wins (1 line each, huge impact):**
   - Remove `localeOverride="en"` on affiliate portal
   - Surface-test affiliate portal
2. **Shared component pass** (Pattern A) — fixes English defaults across many pages at once
3. **Topbar pass** (Pattern G) — `reporting-picker` + `store-switcher` are in every page
4. **Dedupe Instagram/Meta Ads panels** (Pattern D) — fixes ~45 strings via reuse
5. **Per-surface dictionary fills** — start with **Growth Agent** + **Settings/Meta Ads** since they're 100% English
6. **Long tail** — Retention, Profit, Product Follow-ups, Alerts, Weekly Summary, Marketing Planner

Steps 1-4 are mostly mechanical and high-leverage. Steps 5-6 are the bulk
of the work but each is contained to one surface, so they can be done
incrementally without blocking each other.
