// Route-render smoke suite (M-10). Turns the manual QA "does every page
// render" pass into something CI can enforce: for each route it asserts the
// server responded (< 400), the page threw no uncaught error, no non-benign
// console errors fired, and (for the authed Hebrew-first shell) the document
// renders RTL Hebrew.
//
// Requires a running server — see playwright.config.ts for env. The suite
// SKIPS itself when DEV_QA_BYPASS_TOKEN is absent (can't bypass auth), so it
// never fails spuriously in an unconfigured environment.

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const BYPASS = process.env.DEV_QA_BYPASS_TOKEN?.trim();
const STORE_ID = process.env.E2E_STORE_ID?.trim();
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

// Authed app routes — Hebrew-first, so the shell renders dir=rtl / lang=he.
const AUTHED_ROUTES = [
  "/dashboard",
  "/profit",
  "/profit/costs",
  "/discounts",
  "/retention",
  "/affiliate-portal",
  "/affiliate-portal/coupons",
  "/creator-flow",
  "/weekly-summary",
  "/marketing-planner",
  "/portfolio",
  "/alerts",
  "/settings",
  "/settings/account",
  "/settings/organization",
  "/settings/audit-log",
  "/billing"
];

// Public routes — no auth, language/layout not asserted (they vary).
const PUBLIC_ROUTES = ["/login", "/welcome"];

// Console noise that is not a real defect. Anything else fails the route.
const BENIGN_CONSOLE = [
  /favicon/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /Failed to load resource:.*\b(404|401)\b.*(analytics|fonts|gstatic)/i
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (BENIGN_CONSOLE.some((re) => re.test(text))) return;
    errors.push(`console.error: ${text}`);
  });
  return errors;
}

async function seedAuth(context: BrowserContext) {
  const cookies = [
    { name: "gg_qa_bypass", value: BYPASS!, url: BASE },
    { name: "app-locale", value: "he", url: BASE }
  ];
  if (STORE_ID) cookies.push({ name: "active_store_id", value: STORE_ID, url: BASE });
  await context.addCookies(cookies);
}

test.describe("smoke: routes render", () => {
  test.skip(!BYPASS, "DEV_QA_BYPASS_TOKEN not set — cannot bypass auth for the smoke run");

  test.beforeEach(async ({ context }) => {
    await seedAuth(context);
  });

  for (const route of AUTHED_ROUTES) {
    test(`authed ${route}`, async ({ page }) => {
      const errors = collectErrors(page);
      const res = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(res, `no response for ${route}`).toBeTruthy();
      expect(res!.status(), `HTTP status for ${route}`).toBeLessThan(400);

      // Hebrew-first shell renders RTL Hebrew.
      const html = page.locator("html");
      await expect(html, `dir on ${route}`).toHaveAttribute("dir", "rtl");
      await expect(html, `lang on ${route}`).toHaveAttribute("lang", "he");

      // Let late (post-hydration) errors surface before asserting.
      await page.waitForTimeout(600);
      expect(errors, `errors on ${route}:\n${errors.join("\n")}`).toEqual([]);
    });
  }
});

test.describe("smoke: public routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`public ${route}`, async ({ page }) => {
      const errors = collectErrors(page);
      const res = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(res, `no response for ${route}`).toBeTruthy();
      expect(res!.status(), `HTTP status for ${route}`).toBeLessThan(400);
      await page.waitForTimeout(400);
      expect(errors, `errors on ${route}:\n${errors.join("\n")}`).toEqual([]);
    });
  }
});
