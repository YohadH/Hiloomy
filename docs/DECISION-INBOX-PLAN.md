# Decision Inbox — implementation plan (2026-09-07)

Hiloomy's new home screen: **Today — Commercial Decision Inbox**. The product idea is
that Hiloomy reviews everything, suppresses routine noise, and surfaces only the few
commercial decisions that deserve a Brand Manager's attention. This document is the plan
that the implementation follows; it is kept next to the code so future work stays on it.

## 0. Design rule — one place for decisions (2026-09-08)

> **A recommendation can be generated anywhere. A decision can live only in
> one place.**

Everything that requires the manager's judgment ends up on **Today**. The
engines produce Decisions into the ledger; no surface renders its own list of
recommendations next to it. Shopify (Sidekick Pulse), Triple Whale (Moby
Actions) and Marklo all converge on a single action workflow; Hiloomy's
difference is not the centralization but *which* decisions get there —
cross-domain ones (Inventory × Sales × Meta, Affiliate × Customer history,
Discount × Profit × Product, Competitor × Product × own performance).

```text
Inventory engine ──────┐
Profit engine ─────────┤
Campaign engine ───────┤
Affiliate engine ──────┤
Competitor engine ─────┤
Plan engine ───────────┘
          ↓
    DECISION LAYER (Alert ledger: state, evidence snapshots, judgment)
          ↓
       TODAY
          ↓
 Receipt → Approve / Ignore / Watch
          ↓
        Memory
```

Roles:

| Surface | Role | May it recommend? |
| --- | --- | --- |
| Today | source of truth for decisions | yes — the only place |
| Market | external context / evidence | no; a competitor move becomes a decision only through the competitor engine |
| Command Center | executive overview: risk, money, pointer to Today, one market line; `?channel=online|pos` filters the money snapshot, KPI grid and trend chart only (the rest of the page and every engine stay whole-store) | no |
| Data Health | what the decisions rest on | no |
| Hiloma chat | explain, prepare | debt: answers that are decisions must end in "added to Today" |
| Weekly summary | narrative | debt: must reference ledger decisions, not invent parallel ones |

Applied on 2026-09-08: the Command Center's AI action brief (a second,
model-generated decision list) and its alert cards (the same ledger rows
re-rendered with "recommended action") were removed; the page now shows
counts and links. The Meta insight card lost its "what to do now" list.

## 0b. Plan = intent · Data = reality · Today = decisions (2026-09-09)

The Marketing Planner is the brand's source of commercial intent. Each
Gantt row-group is a **Commercial Initiative**; Hiloomy continuously checks
it against live data and, when an assumption behind it stops holding, a
Decision is created in the ledger and shown on Today. The Plan page then
reflects the decision ("updated by D-184: original 15% → approved 10%").
Plan never runs its own decision workflow.

**Phase 1 — shipped 2026-09-09** (`lib/domain/plan.ts`,
`lib/services/plan-service.ts`, `components/plan/plan-view.tsx`,
`GET /api/gantt/[sheetId]/plan`): rows grouped into initiatives (same
text/role/category over contiguous dates — a month-long merged cell is one
initiative); status PLANNED / READY / BLOCKED / LIVE / COMPLETED from dates
and OBSERVABLE dependencies only (coupon code seen in Shopify data, named
products' inventory and 14-day sales, live campaigns on them, real cost on
file); month header with counts, one-line plan health, "coming up",
status-first calendar, phone agenda, day panel grouped by status, initiative
cards with "Hiloomy checked" and current facts, "fix data" when cost is
missing. Nothing invented: no intent, no revenue targets, no creative or
approval state.

**Rebuilt 2026-09-09 (owner: "the Plan must influence Today")** — the model
is now cells → Commercial Initiatives → execution actions → decision hooks:

- `groupIntoClusters`: rows sharing an anchor (event/holiday name, launch
  name, coupon code, named product) over dates within 3 days of each other
  are one initiative; rows without an anchor stay singletons with low
  grouping confidence. `mergeExecutionSpans`: a merged month-long cell (one
  row per day) is one execution. Take a Nap September: 286 cells → 28
  initiatives · 41 execution actions.
- `detectDecisionHooks`: "אופציונלי / בהתאם ל / במידה ו / optional /
  depending on" → conditional hook, window 7 days before start → end;
  "הערכת מצב / לבדוק סטטוס / לבחון המשך / משאירים או / להחליט אם / review
  status / continue or stop" → review hook, window −1 → +2 days. One hook per
  kind per initiative. Marketing copy that merely says "decide" or ends in
  "?" is not a hook.
- Engine `upsertPlanDecisions` (runs with the other engines on every Today
  build and on the 05:00 cron): a hook whose window contains today becomes a
  ledger row `plan_decision` keyed by hook id; `planDecision` builds the
  Decision with measured evidence only (7d sales pace vs prior 7d, net sales,
  contribution margin, named products' 14d units / cover / live campaigns);
  status CHANGE PLAN when the plan's assumption conflicts (demand already
  up ≥10% or cover <14d for a conditional discount), else TEST. Those two
  thresholds are **V0 rule-based heuristics**, not learned; the receipt
  says so ("בסיס הטריגר / V0 rule" evidence fact + `payloadJson.triggerRule`).
  One hook → one ledger row → evidence refreshed on every run
  (`payloadJson.evidenceRefreshedAt`; snapshots via `advanceLedger`).
  A window that closes with no human choice is **EXPIRED**, never
  auto-resolved: `resolvedBy: "system:expired"`,
  `humanDecision.choice = "expired"`, counted separately in the report
  ("pending / auto-closed / expired") and shown in Plan and Memory as
  "פג תוקף — לא התקבלה החלטה".
- Initiatives come in two kinds. `kind: "move"` has an anchor or ≥2 rows
  (a commercial move); `kind: "unattached"` is a singleton channel task
  (a newsletter at 10:00, an influencer beat). Unattached rows are listed
  under "פעולות ללא מהלך" in the day panel, are not counted as initiatives,
  and never get hooks. Take a Nap September review: of the 28 groups,
  ~10 are real moves (ראש השנה 5 exec, Back in stock 4, סוכות 3, Give &
  Take 2, Gift card ×2, השקת סאטן קוטור, …); the rest are unattached.
- **Manual grouping override (P0, shipped):** the operator can Split an
  execution into its own initiative, Move it to another initiative, Merge
  one initiative into another, and Exclude an initiative from the decision
  engine (its hooks never reach Today; existing open rows expire). Stored
  in SystemConfig `plan_overrides:<sheetId>` and re-applied on every read
  (`applyOverrides`); POST `/api/gantt/[sheetId]/plan/overrides`. Ids are
  stable (`hash(anchor.key|start)`), so overrides survive re-uploads of
  the same file.
- Execution action = **channel first**: a newsletter cell that mentions
  "15%" is an email campaign, not a Shopify coupon (`effectiveActionType`
  in the view, and the parser's channel classification wins over the
  cell's coupon pattern). The creative-studio link carries the whole move
  as its brief: initiative · offer · dates · channel · cell text.
- Plan reads its decisions back (`payloadJson.sheetId`): NEEDS DECISION +
  "Decision D-xxx is waiting in Today →"; resolved → "Updated by decision
  D-xxx: original / decided". The Plan page never renders the receipt.
- Page: month header (initiatives · execution actions · status chips),
  "decisions affecting your plan", coming up, status-first calendar showing
  initiatives, phone agenda, day panel grouped by initiative with ✓/○
  executions (✓ only when observable). The general "Hiloomy insights" pane
  was removed; brief + role PDFs live in a collapsed "Export & tools".

- **Exports (9 Sep 2026, owner review "Generate PDFs from Commercial
  Initiatives, not from raw Gantt tasks"):** two exports only, both
  deterministic, both from `buildPlanView` — `lib/services/plan-brief-service.ts`
  (`composePlanBrief`, tested), `/print/plan-brief`, `POST
  /api/gantt/[sheetId]/export-plan-pdf?kind=commercial|role&role=…|all`.
  *Monthly Commercial Brief* (management): header counts, then each move
  once — period · status, offer + coupon, channels, owners, products,
  dependencies, decision dependency ("⚠ Management decision pending ·
  D-xxx · Open in Today", or "expected on <date>" for a hook whose window
  has not opened), ONE consolidated note per move (e.g. a coupon shared by
  two moves), actions grouped by team, then unattached actions and the
  sync change log. *Role Action Brief* (per team + customer service +
  "all" = one document, a page per team): only the moves the team touches,
  "what <team> owns", first due date, dependencies, absolute links into
  Hiloomy (creative studio with the move as the brief), plus the team's
  standalone sends. Nothing invented: no audience, budget or approvals.
  Studio UI collapsed to one "Export & Share" block (Preview / PDF /
  team buttons / Download all). The LLM marketing brief and the per-role
  cell dumps were removed from the UI.

**Still owed (phase 2b, post-freeze):** verdicts WATCH / LIVE REVIEW from
live performance vs the named products' baseline (no hook needed) and
proximity-tiered evaluation depth.

**Phase 3:** "Prepare" for coupon creation (affiliate portal already
creates codes), completed initiatives kept with decisions and outcomes for
Memory.

## 0c. Decision Candidate Audit — is Today's prioritisation auditable? (2026-09-10)

Product question: when Hiloomy surfaces an inventory decision, is that the
best use of management attention, or is the system structurally better at
finding inventory problems? Answered by SHADOW instrumentation — Today is
unchanged, no forced domain diversity.

    DOMAIN ENGINES → CANDIDATES → GLOBAL RANKING → SUPPRESSION → TODAY

- Every engine pass (`buildDecisionInbox`, Today load or 05:00 cron) calls
  `recordCandidateRun` (`lib/services/decision-candidate-audit-service.ts`)
  after the cards are chosen. Page loads are throttled to one run per hour;
  the cron marks its pass (`markNextAuditTrigger("cron")`).
- Candidates = every ledger decision the inbox built (with what Today did:
  surfaced · `DOMAIN_DISPLAY_CAP` · `LOWER_GLOBAL_PRIORITY` · `ALREADY_DECIDED`
  · `DUPLICATE`) PLUS, for every domain with no ledger row, one PROBE: the
  strongest signal the engine rejected, with the gate it applied
  (`ENGINE_THRESHOLD` + text such as "leakage 10% < 15%"), or a NONE row
  with `NOT_ELIGIBLE` (data not connected — this is absence, not bias),
  `NO_CANDIDATE`, `NO_ENGINE` (Returns), `NOT_IN_DECISION_WINDOW` (plan
  hooks), `NO_MANAGEMENT_JUDGMENT` (silent product with no campaign lever).
  Probes reuse what the inbox already loaded (product economics, leakage,
  Meta overview, plan) plus two ungated SQL reads for discount × profit and
  the competitor week section.
- Scoring (`lib/domain/decision-candidate.ts`): seven 0–100 dimensions.
  Measured: materiality (₪ exposure as a share of the store's 14-day net
  sales, kind default when no ₪ so a missing number never kills a domain),
  urgency (days of cover / decision window), confidence (evidence quality),
  actionability. Declared V0 priors per kind (`KIND_PRIORS`, version
  `kind-priors-v0`): management judgment (+25 for a stockout when paid
  media buys the demand), novelty, cross-domain (from domains joined +
  campaign materiality). Weights `decision-ranking-v1` (25/15/10/15/15/10/10),
  stored per run. `observableScore` = the four measured dimensions only, so
  the report can show rankings with and without the priors. No model call;
  same inputs → same ranking.
- Persistence: `DecisionCandidateRun` + `DecisionCandidate`
  (migration `20260910_decision_candidate_audit`, apply by hand on prod).
  Each run stores Today's top and the global top, `topDiffers`, `top3Overlap`.
- Report `buildCandidateAuditReport(storeId, days, exclude[])`: per domain —
  eligible runs, candidates, distinct decisions, surfaced, conversion, avg
  score / observable score / rank / novelty, top-3 share, cross-domain rate,
  top suppression reasons, feedback join (useful / obvious / wrong / changed
  / high-value = useful ∧ ¬obvious, one judgment per decision); disagreement
  (Today #1 ≠ global #1 rate, avg top-3 overlap); latest run with "why this
  outranked the others" from the scores; ablation = re-rank the stored run
  without a domain (analysis only). Inventory bias diagnostic classifies
  NO_EVIDENCE_OF_BIAS / GENERATION_BIAS / RANKING_BIAS /
  REAL_BUSINESS_CONDITION / INCONCLUSIVE and needs ≥5 judged inventory AND
  ≥5 judged other decisions before it will call bias.
- Surfaces: `/decision-audit` (Tools, read-only, active store) and
  `scripts/decision-inbox-report.mjs <storeId> [--days 14] [--exclude inventory]`
  (prints the decision report, then the candidate audit).

## 1. Principles that shape the build

- **Decision Objects, not dashboards.** Every screen is built from one typed shape
  (`Decision`) with status, question, evidence with sources, options, confidence,
  missing evidence, and "what would change this".
- **Real evidence only.** Nothing is invented. Every number comes from an existing
  service; when a fact is not available it is rendered as *Unavailable* and lowers the
  confidence. Evidence quality is one of `known / calculated / estimated / unavailable`.
- **The Alert table is the ledger.** It already has status, resolvedBy, payloadJson
  (outcomes measured 3 days after resolve) and per-store fingerprints. Decisions map
  1:1 to alert rows; derived decisions that have no engine yet are upserted into it by
  the inbox service so they get a stable ID and a human-decision record.
- **DO NOT ACT and WATCH are first-class.** The ranking is by ₪ exposure, not severity
  label, and the inbox holds at most five cards. Everything else is on the Watchlist.
- **Zero decisions is a success state** and is rendered as such.

## 2. Data composition (what feeds each decision)

| Decision kind | Status | Sources (all existing) | Rule |
|---|---|---|---|
| Stockout × paid traffic | ACT / WATCH | `stockout_imminent` alerts (payload: inventory, velocity, days cover, trailing revenue, active campaigns) + `getActiveCampaignsByProduct` + per-product 14d economics | ACT when cover ≤ 14 days (engine severity critical/high), else WATCH; a linked campaign changes the question only when its materiality is `material`/`driver` (see 5b) |
| Discount × Profit | TEST | per-product SQL (30d, real cost only): ≥30 units, discount ≥15 % of list, contribution ≥0 but <25 % of net | "Should the discount continue although it lowers contribution?" |
| Campaign × Product | CHANGE PLAN | `product_gone_silent` alerts that carry a live linked campaign + per-product 14d economics for a candidate SKU (real cost, positive contribution, >30 days cover) | "Move spend to a SKU with better stock and margin?" — candidate unavailable when none qualifies |
| Returning-customer affiliate commission | TEST | `getCommissionLeakageSummary` (30d) | TEST when returning commission ≥ ₪500 and ≥ 15 % of classified commission; smaller → Watchlist |
| Product unprofitable standalone | DO NOT ACT | per-product SQL over `OrderLineItem` (90d: units, net, discounts, COGS, cost coverage) + `BundleComponent` presence | DO NOT ACT when contribution < 0 with ≥ 95 % cost coverage and basket economics are not modelled |
| Competitor promotion | WATCH / ACT | `competitor_promo` alerts + 7d vs prior-7d sales velocity (`getShopifySalesSummaryForWindow`) + GA4 conversion when available | WATCH unless velocity −12 % or conversion −8 % |
| Campaign ROAS collapse | CHANGE PLAN | `roas_collapse` alerts | surfaced as-is with campaign evidence |

The Today page first runs the same idempotent engines the Command Center runs
(stockout, ROAS, competitor, outcome measurement) so the ledger is fresh, then reads.

Summary numbers are derived, not decorative: *signals reviewed* = products considered
by the stockout engine + Meta campaigns in the window + affiliate conversions
classified + competitor snapshots + open alerts; *suppressed* = reviewed − surfaced −
watched; *data confidence* = the setup-health score.

## 3. Files

Domain and service
- `lib/domain/decision.ts` — `Decision`, `DecisionStatus`, `EvidenceFact`, `Confidence`,
  `EvidenceQuality`, `DecisionInbox`, `WatchItem`, `MemoryEntry`.
- `lib/services/decision-inbox-service.ts` — `buildDecisionInbox(storeId)`,
  `getDecision(storeId, id)`, `listDecisionMemory(storeId)`, `buildDataHealth(storeId)`,
  `buildMarketView(storeId)`; decision builders per kind; ledger upsert for derived kinds.
- `app/api/decisions/[id]/decide/route.ts` — POST `{ choice: approve | alternative |
  ignore, optionKey? }` → alert status + `payloadJson.humanDecision`.

Components (`components/decisions/`)
- `status-pill.tsx` — the five statuses; status is the strongest visual cue, one accent.
- `evidence.tsx` — evidence fact with source + quality tag; grouped evidence list.
- `decision-card.tsx` — inbox card (title, question, evidence chips, exposure,
  recommendation, confidence, missing evidence, actions).
- `decision-receipt.tsx` — full detail: Decision, Trigger, Evidence by source, What
  Hiloomy connected, Options, Recommendation, Confidence, Missing evidence, What would
  change this, Human decision buttons, receipt footer.
- `decision-drawer.tsx` — client side-sheet (portal) hosting the receipt.
- `decision-inbox.tsx` — client list + drawer state + human-decision calls.
- `today-summary.tsx` — greeting, headline count, context line, brand and freshness.

Pages
- `app/today/page.tsx` (+ `loading.tsx`), `app/today/[id]/page.tsx` (deep link to a receipt)
- `app/watchlist/page.tsx`, `app/market/page.tsx`, `app/memory/page.tsx`, `app/data-health/page.tsx`

Navigation
- `components/layout/sidebar.tsx` — primary: Today, Watchlist, Market, Plan
  (`/marketing-planner`), Memory, Data Health. Bottom "Tools" section: Command Center,
  Creative Studio, Affiliates, Discounts, Weekly summary, Creators, Offline, Product
  follow-ups, Retention, Product costs, Alerts, Settings. Module flags still apply.
- `middleware.ts` + `app/page.tsx` — signed-in home becomes `/today`.

## 4. Copy and locale

Hebrew is the default; English is complete. Strings live next to the components as
`{ he, en }` pairs, matching the rest of the app. Currency is ₪ with no decimals.

## 5. Verification

Done on 2026-09-07:
- `tsc --noEmit` clean, unit tests (110) pass, production `next build` run.
- The five new routes were added to `tests/e2e/smoke.spec.ts` so CI renders them.

Still owed (needs a running server with a database, which this workstation does not have):
- Today with 0 decisions and with 1–5 decisions, drawer open/close, approve /
  alternative / ignore round-trip, Memory showing the decision after a choice, RTL + EN,
  phone width.

## 5b. Wedge-test package (2026-09-07, second pass)

Agreed with the owner before a two-week freeze. Logic, not design:

- **Stockout logic.** ACT is decided by days of cover (≤14), not by the campaign. The
  decision today is replenishment only; the campaign stays as is. A separate campaign
  decision opens only if the supplier cannot deliver inside the cover window AND the
  campaign is material.
- **Campaign materiality** (`assessMateriality`): spend share of product revenue and
  campaign purchases ÷ product units → `evidence` / `material` / `driver`. Meta is
  evidence-only until the numbers say otherwise.
- **Presentation cap, not decision cap.** ≤2 cards per kind on Today (a critical one
  may add a third), ≤5 overall. The ledger keeps every decision; overflow → Watchlist.
- **Two more engines**, framed as management trade-offs: Discount × Profit
  (`decision_discount_tradeoff`, TEST) and Campaign × Product
  (`campaign_reallocation` from silent-product alerts with a live campaign, CHANGE PLAN).
- **Exposure in three dimensions** (revenue / profit or "COGS missing" / inventory or
  spend) instead of one number.
- **Connected line** on every card and a business-readable "A + B + C = consequence"
  block on the receipt.
- **Judgment**: Useful / Obvious / Wrong / Missing context + "did this change your
  decision?" via `POST /api/decisions/[id]/judge`, stored in `payloadJson.judgment`.
- **Stateful ledger**: `payloadJson.decision` = state (open → watching → escalated →
  resolved), `firstDetectedAt` (engine period start when known), `surfacedAt`, daily
  evidence snapshots. `upsertAlert` now preserves ledger keys across re-detections.
- **Daily cron**: `POST /api/cron/decision-inbox` + in-process scheduler at 05:00
  Israel (`lib/server/decision-inbox-cron.ts`, env prefix `DECISION_INBOX`).
- **Review table**: `node --import tsx scripts/decision-inbox-report.mjs <storeId> --days 14`.

## 6. Out of scope for this pass

- Competitor ↔ product matching with a relevance score (no data source yet; the card
  shows the match as unavailable rather than inventing one).
- Supplier lead time and purchase cost (rendered as missing evidence).
- Basket-level contribution when no bundles are defined.
