// Smoke test for the RivalSweeper API Layer (apilayer.rivalsweeper.com/v1).
// Exercises the same contract as lib/clients/rivalsweeper-client.ts:
//   1. OAuth2 client-credentials → JWT with company_guid claim
//   2. GET /companies/{cg}/domains → the monitored set
//   3. Per-domain homepage-promo + markdowns reports
//   4. Company-level coupons + free-shipping reports
//
// Usage:
//   node --env-file=.env scripts/smoke-rivalsweeper.mjs
//
// Never prints the key/secret — only status and data shapes.

const BASE = (process.env.RIVALSWEEPER_API_URL || "https://apilayer.rivalsweeper.com/v1").replace(/\/$/, "");
const KEY_ID = process.env.RIVALSWEEPER_KEY_ID;
const KEY_SECRET = process.env.RIVALSWEEPER_KEY_SECRET;

if (!KEY_ID || !KEY_SECRET) {
  console.error("RIVALSWEEPER_KEY_ID / RIVALSWEEPER_KEY_SECRET missing in env.");
  console.error("Add them to .env and run: node --env-file=.env scripts/smoke-rivalsweeper.mjs");
  process.exit(1);
}

function decodeJwtClaims(token) {
  try {
    const b64 = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

async function main() {
  // ── 1. Auth ────────────────────────────────────────────────────────────
  console.log(`→ POST ${BASE}/auth/token (key ${KEY_ID.slice(0, 8)}…)`);
  const authRes = await fetch(`${BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: KEY_ID,
      client_secret: KEY_SECRET
    })
  });
  const authBody = await authRes.json().catch(() => ({}));
  if (!authRes.ok || !authBody.access_token) {
    console.error(`✗ Auth failed (${authRes.status}): ${authBody.detail ?? authBody.title ?? JSON.stringify(authBody)}`);
    process.exit(1);
  }
  const claims = decodeJwtClaims(authBody.access_token);
  const cg = claims.company_guid;
  console.log(`✓ Auth OK — company_guid=${cg}, expires_in=${authBody.expires_in}s`);
  if (!cg) {
    console.error("✗ Token has no company_guid claim — the production client would reject this.");
    process.exit(1);
  }
  const headers = { Authorization: `Bearer ${authBody.access_token}` };

  const get = async (path) => {
    const res = await fetch(`${BASE}${path}`, { headers });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };

  // ── 2. Monitored domains ───────────────────────────────────────────────
  console.log(`\n→ GET /companies/${cg}/domains`);
  const domains = await get(`/companies/${cg}/domains?limit=500`);
  if (domains.status !== 200) {
    console.error(`✗ Domains call failed (${domains.status}): ${domains.body.detail ?? domains.body.title ?? ""}`);
    process.exit(1);
  }
  const domainRecords = domains.body.records ?? [];
  console.log(`✓ ${domainRecords.length} monitored domain(s):`);
  for (const r of domainRecords) {
    const url = r.payload?.url ?? "?";
    const name = r.payload?.name ?? "";
    console.log(`   • ${url}  (${name})  domain_guid=${r.domain_guid ?? r.record_id}`);
  }
  if (domainRecords.length === 0) {
    console.warn("\n⚠ The monitored set is EMPTY — add your competitors' domains on RivalSweeper.");
    console.warn("  Until then, every sync skips with 'domain not in monitored set'.");
    process.exit(0);
  }

  // ── 3. Per-domain reports ──────────────────────────────────────────────
  for (const r of domainRecords) {
    const dg = r.domain_guid ?? r.record_id;
    const host = r.payload?.url ?? dg;
    console.log(`\n→ Reports for ${host}:`);
    for (const report of ["homepage-promo", "markdowns"]) {
      const { status, body } = await get(`/companies/${cg}/domains/${dg}/reports/${report}?since=7d&limit=100`);
      if (status !== 200) {
        console.log(`   ✗ ${report}: HTTP ${status} ${body.detail ?? body.title ?? ""}`);
        continue;
      }
      const n = body.records?.length ?? 0;
      const refreshed = body.last_refreshed_at ?? "never (crawler hasn't filled yet)";
      console.log(`   ✓ ${report}: ${n} record(s), last_refreshed_at=${refreshed}`);
      const sample = body.records?.[0]?.payload;
      if (sample) {
        const text = sample.message ?? sample.title ?? sample.text ?? sample.banner_text ?? sample.headline;
        if (text) console.log(`     sample: "${String(text).slice(0, 100)}"`);
      }
    }
  }

  // ── 4. Company-level reports ───────────────────────────────────────────
  console.log(`\n→ Company-level reports:`);
  for (const report of ["coupons", "free-shipping"]) {
    const { status, body } = await get(`/companies/${cg}/reports/${report}?since=7d&limit=200`);
    if (status !== 200) {
      console.log(`   ✗ ${report}: HTTP ${status} ${body.detail ?? body.title ?? ""}`);
      continue;
    }
    const n = body.records?.length ?? 0;
    const refreshed = body.last_refreshed_at ?? "never";
    console.log(`   ✓ ${report}: ${n} record(s), last_refreshed_at=${refreshed}`);
  }

  // ── Verdict ────────────────────────────────────────────────────────────
  console.log("\n── Verdict ──");
  console.log("Auth + tenancy work. If domains are listed and reports show last_refreshed_at");
  console.log("dates, the app will pull real data once RIVALSWEEPER_MOCK is removed on Render.");
  console.log("Reports with last_refreshed_at=null are monitored but not yet crawled — the");
  console.log("sync will (correctly) skip them until the provider's pipeline fills.");
}

main().catch((err) => {
  console.error("✗ Smoke test crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
