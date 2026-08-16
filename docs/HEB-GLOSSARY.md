# Hebrew terminology glossary (owner-approved) — SA-HEB-02

Approved by the owner on 2026-06-15. This is the single source of truth for how the
technical terms that "stayed in English" are presented in the **Hebrew** UI. Apply these
forms to every new user-facing Hebrew string so the wording stays consistent.

The owner's standing rule (answer to the open question): **add a short parenthetical
explanation of what each term means — in both Hebrew and English** — the first/primary
time a term appears in a given screen. Short repeat mentions may use the bare term.

| Term | Hebrew UI form (canonical) | Decision |
|------|----------------------------|----------|
| Retention | **שימור לקוחות** (fully translated — no English) | (1) translate everywhere; "ריטנשן" is banned |
| SKU | **SKU** (English) — introduce once as `SKU (יחידת מלאי / Stock Keeping Unit)`; `מק״ט` is also acceptable | (2) stays English everywhere — "no problem" |
| LTV | **אורך חיים לקוח** (fully translated — no English) | (3) translate; "LTV" is banned in Hebrew copy |
| COGS | **עלות מוצרים (COGS)** — full form `עלויות מוצרים (COGS / Cost of Goods Sold)` once on the Profit → Product costs page | (4) keep as `עלות מוצרים (COGS)`; never bare `COGS` |
| OAuth | **OAuth** — introduce as `OAuth (התחברות מאובטחת)` | (5) stays English + Hebrew gloss |
| Webhook | **Webhook** — introduce as `Webhook (עדכונים אוטומטיים בזמן אמת)` | (5) stays English + Hebrew gloss |
| Admin API | **Admin API** — introduce as `Admin API (ממשק הניהול של Shopify)` | (5) stays English + Hebrew gloss |
| Partner Dashboard | **Partner Dashboard** — introduce as `Partner Dashboard (לוח הבקרה של שותפי Shopify)` | (5) stays English + Hebrew gloss (appears in the Shopify connection creds form, `saas-strings.ts`) |
| Instagram / Meta Ads / Shopify / BixGrow / Resend | English, verbatim | (6) product names — never translated |
| DTC | **DTC** — introduce as `DTC (מכירה ישירה לצרכן / Direct to Consumer)` | (7) stays English + gloss |
| p90 | **p90** — introduce as `p90 (אחוזון 90 / 90th percentile)` | (8) stays English + Hebrew gloss |

Notes:
- LTV and COGS get a Hebrew-forward presentation (the owner chose a Hebrew primary term);
  all other terms stay English-forward with a parenthetical gloss.
- The gloss is for the *primary* occurrence on a screen, not every mention — repeating a long
  parenthetical on every line hurts readability.
