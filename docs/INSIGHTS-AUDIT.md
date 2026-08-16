# Insight Quality & Correctness Audit — SA-INSIGHTS-01

**Date:** 2026-06-15 · **Agent:** developer · **Scope:** every insight / recommendation /
AI-summary the app renders, page by page.

Owner symptom: *"The insights the app gives on every page are not good and sometimes not even
correct — we need to overhaul this. The same idea also repeats across pages."*

Method: inventoried every page route (`app/**/page.tsx`), traced each insight surface to its
generator, classified it **LIVE** (rendered today) vs **DEAD** (computed but no UI consumer),
verified the math/window/metric, checked the on-disk text encoding, and ran a verbatim
cross-page duplication scan.

---

## Headline findings

1. **🔴 FIXED — The entire Hebrew Overview/Command Center rendered as garbage (mojibake).**
   `lib/services/analytics-service.ts` was the **only** file in the whole repo that was
   **double-encoded** (UTF-8 text decoded as CP1252 then re-saved as UTF-8): **1255 mojibake
   sequences, 0 valid Hebrew bytes**. Every Hebrew string it produces — most importantly the six
   **KPI tile labels** that ARE live on the Command Center (`overview.kpis[].label` → `KpiTile`) —
   rendered as `×©×™×¢×•×¨...` to the Hebrew user (the default locale). This is the literal
   "not even correct" complaint. Reversed the CP1252 double-encoding back to clean UTF-8;
   `tsc --noEmit` clean; repo-wide re-scan shows **0** double-encoded files.

2. **🟠 FIXED — Alerts page lied about its time window.** `generateAlerts()`
   (`lib/services/alert-service.ts`) hardcoded every alert's `periodLabel` to `"Last 30 days"` /
   `"30 הימים האחרונים"`, but the alerts are computed over the **user-selected** reporting window
   (`getReportingDateRangeSelection`). Picking 7/90/custom days showed alerts stamped "Last 30
   days" — wrong. Now uses the real, locale-aware window label (`range.label`).

3. **🟡 DOCUMENTED (no code change) — a whole dead "generic insight" system still exists.**
   The old top-of-funnel insight cards are computed but **rendered nowhere** (superseded by the
   Command Center alert engine + contribution-margin panel). These are almost certainly the
   "weak/generic, repetitive" insights the owner remembers. Left in place (deleting is out of
   scope and risky); flagged for a dedicated cleanup task. See "Dead code" below.

4. **✅ No verbatim insight repeats across pages.** Duplication scan over all insight services +
   page files found only shared *code* scaffolding (imports, JSX, OpenAI fetch plumbing, shared
   LLM system-prompt instructions) — **zero** shared user-facing insight sentences.

---

## Per-page insight inventory

| Page | Insight surface | Source | Status |
|---|---|---|---|
| **/** Command Center | KPI tile labels (He) | `analytics-service.getOverviewPayload().kpis` | **FIXED** (was mojibake) |
| **/** Command Center | Critical/High + Med/Low alert cards | `alert-writer-service.listOpenAlerts` (normalized `alerts` table, fed by stockout / roas-collapse detection engines) | LIVE, correct |
| **/** Command Center | Contribution-margin panel + notes | `contribution-margin-service` | LIVE, correct |
| **/** Command Center | "What happened after you acted" (closed loop) | `alert-outcome-service` | LIVE, correct |
| **/** Command Center | Setup-health / data-confidence badge | `setup-health-service` | LIVE, correct |
| **/alerts** | Alert cards (revenue/discount/refund/returning/strong-product, threshold-gated) | `alert-service.generateAlerts` (or stored `repository.getAlerts` for EN) | LIVE; **window label FIXED**. Note: page chrome (headline + section heads) is English-only even in He locale (quality, not correctness). |
| **/weekly-summary** | "Weekly growth insights" (title / what-the-agent-thinks / evidence / recommended action / confidence) | `weekly-summary-insights-service.buildWeeklyAgentInsights` | LIVE, correct (guarded CPA = spend/purchases, threshold severity, low-sample guards). English-only text. |
| **/weekly-summary** | Founder summary headline (LLM) | `summary-service` + `summary-insights-service.generateSummaryHeadline` (gpt-4o-mini, deterministic fallback) | LIVE, correct |
| **/profit** | Revenue-by-product / margin bar "insight" charts | `BarInsightChart` (visualization, not text) | LIVE, correct |
| **/profit** | Channel CAC recommendation pills | `channel-cac-service` | LIVE, correct |
| **/retention** | Cohort / repeat-rate bar "insight" charts | `BarInsightChart` | LIVE, correct |
| **/growth-agent** | Findings + product recommendations | `growth-agent-service`, `recommendation-engine-service` (8-rule ROAS table — pure, well-formed) | LIVE (experimental), correct |
| **/marketing-planner** | Brief studio insights (summary/calendar/trends/issues/recommendations/open-questions) | `marketing-planner-service.buildInsights` | LIVE (experimental) |
| **/print/meta-ads-weekly** | Meta + Instagram report insights (He LLM) | `meta-ads-report-insights-service`, `instagram-report-insights-service` | LIVE (export), correct UTF-8 |
| **(dead)** | `overview.insights` (top product / top discount / most-profitable collection / biggest drop / repeat highlight) | `analytics-service` `insights[]` | **DEAD** — no consumer |
| **(dead)** | `overview.actionPanel` (what changed / needs attention / recommended actions) | `analytics-service` `actionPanel[]` | **DEAD** — no consumer |
| **(dead)** | `overview.alerts` (unconditional refund/discount/repeat) | `analytics-service.buildOverviewAlerts` | **DEAD** — no consumer |
| **(dead)** | `InsightGrid`, `InsightCard` components | `components/dashboard/insight-grid.tsx`, `components/dashboard-v2/insight-card.tsx` | **DEAD** — no import sites |
| **(dead)** | `getActionableInsights()` | `lib/services/insights-service.ts` | **DEAD** — no caller |

---

## Dead code (flagged for a follow-up cleanup task — NOT removed in this pass)

`buildOverviewAlerts()` is the clearest example of *why* this matters: it emits, **unconditionally
and with no threshold**, "Refund rate is elevated" / "Discount mix needs review" / "Returning
customer rate should be monitored" — i.e. it would assert "refunds elevated" even at 1%. It is the
exact kind of false insight the task warns about, but it is currently **not rendered**, so it
harms no user today. The live equivalent (`generateAlerts`) is correctly threshold-gated.

Recommend a separate task to delete: `analytics-service` `insights`/`actionPanel`/`alerts` payload
fields + `buildOverviewAlerts`, `insights-service.ts`, `insight-grid.tsx`, `insight-card.tsx`.
Deletion was deliberately deferred — it is scope-expansion beyond "fix the insights users see,"
and removing exported symbols risks a dynamic-import or print/PDF consumer the grep didn't catch.

---

## Regression guard (detection recipe)

Re-detect double-encoding at any time (0 = clean):
```
node -e 'const fs=require("fs");let n=0,b=fs.readFileSync(process.argv[1]),p=Buffer.from([0xC3,0x97]),i=0;while((i=b.indexOf(p,i))!==-1){n++;i+=2}console.log(process.argv[1],"mojibake:",n)' <file>
```
A file with many `C3 97` and zero raw `0xD7` bytes is double-encoded Hebrew. Fix = decode bytes as
UTF-8 → re-encode the string as CP1252 → decode that as UTF-8 → write back as UTF-8.

## What QA should re-check
- Load `/` in **He** locale → the six KPI tile labels read as real Hebrew (שיעור לקוחות חוזרים,
  ערך הזמנה ממוצע, שיעור הנחות, שיעור החזרים …), **not** `×©×™×¢×•×¨`.
- On `/alerts`, switch the reporting window to **Last 7 / Last 90 days** → every alert's period
  label matches the chosen window, not a fixed "Last 30 days".
- Spot-check a sample of live alerts against the DB (refund/discount/returning thresholds fire
  only when the metric actually crosses the threshold).
