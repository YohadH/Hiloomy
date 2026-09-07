// Battery-probe the RivalSweeper API to see which data types actually return
// data — mapped to the requirements list. READ-ONLY, no DB. Uses the same
// OAuth (RIVALSWEEPER_KEY_ID/_SECRET) the app uses. Sequential + throttled to
// stay under 10 req/s. Prints, per endpoint: HTTP status + record count (or
// error), so we can tell "works / empty / 404 / not-supported".
//
// Usage (PowerShell):
//   $env:RIVALSWEEPER_KEY_ID="..."; $env:RIVALSWEEPER_KEY_SECRET="..."
//   node scripts/probe-rivalsweeper-api.mjs [domain]
//   (default domain: byredo.com — a monitored fragrance competitor)

// Load the project .env into process.env (RS keys) the same way the app does,
// via Prisma's env loader — no DB connection is opened by construction alone.
import { PrismaClient } from "@prisma/client";
try { new PrismaClient(); } catch { /* env still loads */ }

const BASE = (process.env.RIVALSWEEPER_API_URL || "https://apilayer.rivalsweeper.com/v1").replace(/\/$/, "");
const DOMAIN = process.argv[2] || "byredo.com";
const KEY_ID = process.env.RIVALSWEEPER_KEY_ID;
const KEY_SECRET = process.env.RIVALSWEEPER_KEY_SECRET;
if (!KEY_ID || !KEY_SECRET) { console.error("Set RIVALSWEEPER_KEY_ID and RIVALSWEEPER_KEY_SECRET."); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (u) => String(u).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();

async function main() {
  // 1. token
  const tRes = await fetch(`${BASE}/auth/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: KEY_ID, client_secret: KEY_SECRET })
  });
  const tBody = await tRes.json().catch(() => ({}));
  if (!tRes.ok || !tBody.access_token) { console.error(`auth failed ${tRes.status}: ${tBody.detail ?? ""}`); process.exit(1); }
  const token = tBody.access_token;
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
  const cg = claims.company_guid;
  console.log(`# RivalSweeper API probe · base ${BASE} · company ${cg} · ${new Date().toISOString()}`);

  const get = async (path) => {
    await sleep(140); // ~7 req/s, under the 10/s cap
    try {
      const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      const records = Array.isArray(body?.records) ? body.records.length : Array.isArray(body) ? body.length : null;
      const sampleKeys = records && (body.records ?? body)[0]?.payload
        ? Object.keys((body.records ?? body)[0].payload).slice(0, 8)
        : records && (body.records ?? body)[0] ? Object.keys((body.records ?? body)[0]).slice(0, 8) : [];
      return { status: res.status, records, sampleKeys, detail: body?.detail ?? body?.title ?? null };
    } catch (e) { return { status: "ERR", error: e?.message ?? String(e) }; }
  };

  // 2. resolve domain guid
  const domains = await get(`/companies/${cg}/domains?limit=500`);
  console.log(`\n## domains endpoint: status ${domains.status}, ${domains.records} monitored domains`);
  let dg = null;
  try {
    const res = await fetch(`${BASE}/companies/${cg}/domains?limit=500`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    for (const r of body.records ?? []) if (norm(r.payload?.url) === norm(DOMAIN)) dg = r.domain_guid ?? r.record_id;
  } catch {}
  console.log(`resolved ${DOMAIN} → domain_guid ${dg ?? "NOT FOUND (not monitored)"}`);
  if (!dg) { console.log("Cannot probe domain reports without a guid. Pick a monitored domain."); return; }

  // 3. battery of DOMAIN-level report types (map to the requirements)
  const domainReports = [
    "homepage-promo", "markdowns", "ads", "news", "homepage-top-links",
    // candidates for the data we DON'T currently wire — test if they exist:
    "price", "prices", "price-history", "pricing", "products", "product",
    "catalog", "catalog-changes", "launches", "new-products", "stock",
    "availability", "inventory", "stock-events", "stock-history",
    "reviews", "tech-stack", "ai-readiness", "messaging", "banners", "content", "social"
  ];
  console.log("\n## DOMAIN-level reports (/companies/{cg}/domains/{dg}/reports/<type>?since=90d&limit=5)");
  for (const type of domainReports) {
    const r = await get(`/companies/${cg}/domains/${dg}/reports/${type}?since=90d&limit=5`);
    console.log(`  ${type.padEnd(18)} status=${r.status}  records=${r.records ?? "-"}  ${r.sampleKeys?.length ? "keys=" + r.sampleKeys.join(",") : (r.detail ? "· " + r.detail : "")}`);
  }

  // 4. COMPANY-level reports
  const companyReports = ["coupons", "free-shipping", "price", "launches", "catalog", "products", "promotions"];
  console.log("\n## COMPANY-level reports (/companies/{cg}/reports/<type>?since=90d&limit=5)");
  for (const type of companyReports) {
    const r = await get(`/companies/${cg}/reports/${type}?since=90d&limit=5`);
    console.log(`  ${type.padEnd(18)} status=${r.status}  records=${r.records ?? "-"}  ${r.sampleKeys?.length ? "keys=" + r.sampleKeys.join(",") : (r.detail ? "· " + r.detail : "")}`);
  }

  console.log("\nREAD: status 200 + records>0 = data available; 200 + records 0/null = supported but empty; 404 = endpoint not supported on this API surface.");
  console.log("(The newer per-SKU mcp.rivalsweeper.com /v1/signals/* surface is separate — test with its own key if you have one.)");
}
main().catch((e) => { console.error(e); process.exit(1); });
