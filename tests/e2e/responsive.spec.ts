// Responsive regression (docs/UI-FOUNDATION-PLAN.md, batch 3).
//
// For the product's primary surfaces, at phone / tablet / desktop widths:
//   1. the page never scrolls horizontally (scrollWidth <= innerWidth) — the
//      bug class we kept finding by hand on phones;
//   2. on phones the bottom navigation is present and the desktop sidebar is
//      not, and vice-versa on desktop;
//   3. a screenshot is written under test-results/responsive/ for review.
//      (Not compared: there is no baseline set yet — first run creates the
//      pictures, a human looks at them.)
//
// Same env as smoke.spec.ts: needs a RUNNING server, DEV_QA_BYPASS_TOKEN and
// optionally E2E_STORE_ID.

import { test, expect, type BrowserContext } from "@playwright/test";

const BYPASS = process.env.DEV_QA_BYPASS_TOKEN?.trim();
const STORE_ID = process.env.E2E_STORE_ID?.trim();
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

const VIEWPORTS = [
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 }
] as const;

const ROUTES = ["/today", "/watchlist", "/market", "/marketing-planner", "/memory", "/data-health", "/dashboard", "/product-follow-ups"];

async function seedAuth(context: BrowserContext) {
  const cookies = [
    { name: "gg_qa_bypass", value: BYPASS!, url: BASE },
    { name: "app-locale", value: "he", url: BASE }
  ];
  if (STORE_ID) cookies.push({ name: "active_store_id", value: STORE_ID, url: BASE });
  await context.addCookies(cookies);
}

for (const vp of VIEWPORTS) {
  test.describe(`responsive: ${vp.name}`, () => {
    test.skip(!BYPASS, "DEV_QA_BYPASS_TOKEN not set — cannot bypass auth");
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ context }) => {
      await seedAuth(context);
    });

    for (const route of ROUTES) {
      test(`${route} fits ${vp.width}px`, async ({ page }) => {
        const res = await page.goto(route, { waitUntil: "networkidle" });
        expect(res, `no response for ${route}`).toBeTruthy();
        expect(res!.status(), `HTTP status for ${route}`).toBeLessThan(400);

        const { scrollWidth, innerWidth, wide } = await page.evaluate(() => {
          // Elements whose box extends past the viewport. Children of a
          // horizontally scrolling container are expected (tables scroll
          // inside their own box) and skipped.
          const out: string[] = [];
          const scrolls = (el: Element | null): boolean => {
            for (let n = el; n && n !== document.body; n = n.parentElement) {
              const ox = getComputedStyle(n).overflowX;
              if (ox === "auto" || ox === "scroll") return true;
            }
            return false;
          };
          for (const el of Array.from(document.body.querySelectorAll("*"))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            if ((r.right > window.innerWidth + 1 || r.left < -1) && !scrolls(el.parentElement)) {
              const cls = (el.getAttribute("class") ?? "").slice(0, 80);
              out.push(`${el.tagName.toLowerCase()}.${cls} [${Math.round(r.left)}..${Math.round(r.right)}]`);
              if (out.length >= 8) break;
            }
          }
          return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, wide: out };
        });
        expect(scrollWidth, `${route} scrolls horizontally at ${vp.width}px`).toBeLessThanOrEqual(innerWidth);
        expect(wide, `${route}: elements wider than the viewport at ${vp.width}px: ${wide.join(" | ")}`).toEqual([]);

        const isPhone = vp.width < 1024;
        const bottomNav = page.locator("nav.fixed.bottom-0");
        const sidebar = page.locator("aside");
        if (isPhone) {
          await expect(bottomNav, "bottom nav on phones").toBeVisible();
          await expect(sidebar, "no sidebar on phones").toBeHidden();
        } else {
          await expect(sidebar, "sidebar on desktop").toBeVisible();
          await expect(bottomNav, "no bottom nav on desktop").toBeHidden();
        }

        await page.screenshot({
          path: `test-results/responsive/${route.replace(/\//g, "_").replace(/^_/, "") || "home"}-${vp.name}.png`,
          fullPage: true
        });
      });
    }
  });
}
