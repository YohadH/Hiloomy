// Playwright-backed PDF renderer.
//
// Launches a headless chromium, navigates to a fully-server-rendered page on
// our own Next.js server, and asks chromium to print it to PDF. Used by
// /api/weekly-summary/export/meta-ads-pdf and any future report exports.
//
// Why chromium and not a JS PDF library:
//   • Hebrew RTL + custom fonts + gradients + glassmorphism all need a real
//     browser renderer to look right.
//   • The report page already exists at /print/meta-ads-weekly — chromium
//     renders the same CSS the user sees in their browser, so there's no
//     divergence between preview and PDF.
//
// Trade-off: chromium adds ~150MB to the deployment artifact. On bare VPS /
// Docker that's fine; on Vercel/Lambda you'd swap to @sparticuz/chromium.
//
// Browser lifecycle: we launch a fresh browser per request. That's the
// simplest correct option for low PDF volume. If this becomes a hot path,
// swap to a persistent singleton + page pool — but premature pooling brings
// its own zombie-process hazards.

import type { Browser, LaunchOptions } from "playwright";

export interface RenderPdfInput {
  // Fully-qualified URL the headless browser should navigate to. Must be
  // reachable from the same machine the Next.js server runs on — usually
  // http://127.0.0.1:<port>/print/... built by the caller.
  url: string;
  // Forwarded as Playwright cookies so the print page sees the same logged-in
  // session as the user who triggered the export. The cookie is set against
  // the URL's hostname.
  cookies?: Array<{ name: string; value: string }>;
  // PDF format. Defaults to A4 portrait, which matches the report layout's
  // 880px max-width well.
  format?: "A4" | "Letter";
}

export async function renderPdfFromUrl(input: RenderPdfInput): Promise<Buffer> {
  // Lazy-require so build-time tooling that doesn't have `playwright`
  // installed can still type-check the rest of the app.
  const { chromium } = await import("playwright");

  const launchOptions: LaunchOptions = {
    headless: true,
    // Playwright 1.45+ defaults `chromium.launch()` to chromium-headless-shell,
    // which requires a separate `npx playwright install chromium-headless-shell`
    // step. Forcing channel: "chromium" makes it use the full Chromium binary
    // we install via `playwright install chromium` — one less moving part on
    // Render's build cache.
    channel: "chromium",
    // Standard flags for running chromium inside Docker / restricted shells.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  };

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      // Render at 1.0 device pixel ratio for crisp PDF text. 2.0 makes
      // the file 4× larger with no visible improvement.
      deviceScaleFactor: 1
    });

    if (input.cookies?.length) {
      const target = new URL(input.url);
      await context.addCookies(
        input.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: target.hostname,
          path: "/",
          httpOnly: false,
          secure: target.protocol === "https:",
          sameSite: "Lax" as const
        }))
      );
    }

    const page = await context.newPage();

    // Block third-party hosts that the print page never needs for rendering
    // (analytics, telemetry, the BI agent tunnel if it's referenced inline).
    // `networkidle` waits for ALL in-flight requests to settle — any single
    // hanging request (a stale tunnel URL, a dead analytics beacon) keeps it
    // from firing and we time out at the gate. Blocking them at the network
    // layer lets the page finish.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      const blocked = [
        ".trycloudflare.com",
        "google-analytics.com",
        "googletagmanager.com",
        "doubleclick.net",
        "facebook.com",
        "facebook.net",
        "segment.io",
        "mixpanel.com",
        "hotjar.com"
      ];
      if (blocked.some((host) => url.includes(host))) {
        return route.abort();
      }
      return route.continue();
    });

    // Wait until the HTML response arrives (`domcontentloaded`). The print
    // page is fully server-rendered — once we have the HTML we have all the
    // content. Then try to wait for `load` (images/fonts) and `networkidle`
    // but DON'T fail if either doesn't settle. A single hanging fetch
    // (stale BI tunnel, dead R2 URL, slow analytics script) shouldn't kill
    // the whole PDF.
    //
    // Timeout 180s on goto because the SSR itself may invoke 2 BI agent
    // calls (60s each timeout) + OpenAI brand/IG insights + heavy DB
    // aggregations before the HTML response can start streaming.
    // 280s — the live BI gateway turns (commentary + brand + IG insights)
    // can push an uncached render past the old 180s ceiling. Keep this
    // below the export route's maxDuration (300s) so the route returns a
    // clean error rather than being killed mid-response.
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 280_000 });
    await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

    const pdf = await page.pdf({
      format: input.format ?? "A4",
      // The page paints its own dark background; printBackground is required
      // to keep it instead of dropping back to white.
      printBackground: true,
      // No margins — the report has its own internal padding and we want
      // the gradient to bleed edge-to-edge.
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
