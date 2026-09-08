# UI foundation plan — operator console, not AI dashboard

Date: 2026-09-08. Source: the UI audit + the owner's review of it.

## Goal

"Open Hiloomy. See what changed. Decide what to do. Leave."

Make Today the design reference for the whole product, remove the
"AI-built SaaS" surface (translucent 28px cards, shadows, blur, green
everywhere, tiny uppercase eyebrows), and give phones a real navigation
model. Decision logic, engines, ledger and judgment are frozen and untouched.

## What is already done (no work)

- Decision feedback (useful / obvious / wrong / missing context + changed
  decision) on every receipt.
- Stateful ledger OPEN → WATCHING → ESCALATED → RESOLVED with evidence
  snapshots.
- Daily cron 05:00 Israel.
- Benchmark export (`scripts/decision-inbox-report.mjs`).

## Scope (P0, three batches, each commit-able on its own)

### Batch 1 — Visual foundation (global, lands everywhere at once)

| File | Change |
| --- | --- |
| `app/globals.css` | Flat canvas (`#F7F7F4`), ink `#19211D`, muted `#69706C`, border `#E1E3DF`, brand green `#1B6747`, positive `#17854B`, warning `#C56A17`, danger `#C33D3D`. Remove the body gradient + radial glow. `tabular-nums` on body. Recharts tooltip 8px radius + menu shadow only. |
| `tailwind.config.ts` | Radius scale: 8 / 10 / 12 / 12 (md / lg / xl / 2xl) so the 500+ existing `rounded-xl` / `rounded-2xl` uses flatten without touching each file. `shadow-soft` → none. Add `shadow-menu`, `shadow-dialog`. Remove `dashboard-glow`. |
| `components/ui/card.tsx` | Flat: border + surface, 12px, no shadow, no blur. Padding 20px. |
| `components/ui/button.tsx` | 8px radius, no shadow, ≥44px touch targets on phones. |
| `components/ui/badge.tsx` | No uppercase / letter-spacing. |
| `components/dashboard-v2/section-head.tsx` | Drop the green uppercase eyebrow; editorial title + one-line hint. Page title 28/32. |

Rules going forward: shadow only on menus/dialogs; green = brand action or
positive state only; orange = warning/change only; pills only for real
statuses; no decorative icon boxes; no `text-[10px]`.

### Batch 2 — App shell

| File | Change |
| --- | --- |
| `components/layout/sidebar.tsx` | Desktop 248px, no brand hero card, mark + store name, primary nav (Today, Watchlist, Market, Plan, Memory, Data Health), Tools group, account footer. Mobile: 56px top bar (mark + store switcher) and a 5-slot bottom nav Today / Watch / Market / Plan / More. More = bottom sheet with the rest + account + sign out. |
| `components/layout/topbar.tsx` | One row: store switcher (desktop only, the mobile top bar has it) + demo/setup badges only when relevant, date range at the end. Domain, marketing copy, org/account chrome removed (account → sidebar footer / More sheet). |
| `components/layout/app-shell.tsx` | Auth/org lookup moves here (shared by sidebar and topbar). Bottom padding on phones reserves the nav. |
| `components/chat/chat-widget.tsx`, `components/sync/sync-status-dock.tsx` | Sit above the bottom nav on phones. Launcher loses the 56px glow bubble look (flat brand circle, no scale). |

### Batch 3 — Today as the reference screen

| File | Change |
| --- | --- |
| `app/today/page.tsx` | No page header; the summary is the header. |
| `components/decisions/today-summary.tsx` | Greeting → headline → breakdown → proof line. Store pill removed (it lives in the top bar now). |
| `components/decisions/decision-card.tsx` | Titles wrap (`line-clamp-2` on phones, truncate from `sm`). Metadata out of the first view: "Connected" becomes a quiet footer line. Primary action full-width, 48px on phones. No lead shadow. |
| `components/decisions/decision-drawer.tsx` | Sticky action bar (Ignore / Approve recommendation) under the receipt on every width; hidden once decided. |
| `components/decisions/decision-inbox.tsx` | "No action needed" heading in normal type; the empty state is a flat panel. |
| `tests/e2e/responsive.spec.ts` | 390×844, 768×1024, 1440×900 on Today, Command Center, Market, Watchlist, Plan, Memory, Data Health, Product follow-ups: no horizontal overflow (`scrollWidth <= innerWidth`), screenshots written for review. |

## P1 — shipped 2026-09-08 (owner asked to continue past P0)

| File | Change |
| --- | --- |
| `components/layout/reporting-picker.tsx` | Phones: one trigger ("Last 30 days · Previous period") opening one bottom sheet with presets, custom dates, comparison, Cancel/Apply; range + comparison commit together. Desktop keeps the two popovers, flattened. |
| `app/watchlist/page.tsx` | Divider list, no card per row, no icon bubble. |
| `app/market/page.tsx` | Editorial event blocks; competitor table becomes one block per competitor below `md`; desktop table kept. |
| `app/data-health/page.tsx` | Diagnostic report: three headline numbers in a row, by-source list with dividers, decision impact as text + one action. |
| `components/dashboard-v2/styled-table.tsx` | `mobileRender` prop + `MobileRowFacts` helper; table hidden below `md` when a phone layout is given. Used on the Command Center top-products table. |
| `components/ui/section-heading.tsx` | Eyebrow as muted text, not a badge (Plan page and other tool pages). |

## P2 — after the two-week wedge measurement

Command Center metric rows instead of six KPI tiles, chart tap-state on
phones, `mobileRender` on the remaining tables (profit, discounts,
retention, campaigns), chat launcher redesign, typography family change
(Manrope stays for now).

## Acceptance

- `npx tsc --noEmit` clean, unit tests green, `next build` passes.
- No page scrolls horizontally at 390px.
- Every primary action on Today reachable one-handed on a phone without
  scrolling back.
- Decision content, ledger and judgment payloads unchanged (diff touches no
  `lib/services/decision-*` file).
