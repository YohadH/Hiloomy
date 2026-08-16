// Higgsfield API smoke test.
//
// Tries a handful of likely auth patterns + endpoints to figure out what
// works with the configured credentials. Once one path succeeds we update
// the production client to match.
//
// Usage:
//   node scripts/smoke-higgsfield.mjs
//
// Env vars consumed (must be set in .env or shell):
//   HIGGSFIELD_API_KEY      (UUID-shaped key)
//   HIGGSFIELD_API_SECRET   (long hex secret)

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const KEY = process.env.HIGGSFIELD_API_KEY;
const SECRET = process.env.HIGGSFIELD_API_SECRET;

if (!KEY || !SECRET) {
  console.error("Missing HIGGSFIELD_API_KEY or HIGGSFIELD_API_SECRET in env.");
  process.exit(1);
}

console.log("Key (first 8):", KEY.slice(0, 8), "...");
console.log("Secret (first 8):", SECRET.slice(0, 8), "...");

// Candidate base URLs — Higgsfield has had a few platform domains.
const CANDIDATE_BASES = [
  "https://platform.higgsfield.ai/v1",
  "https://api.higgsfield.ai/v1",
  "https://platform.higgsfield.ai/public/v1"
];

// Candidate auth header combinations.
const AUTH_PATTERNS = [
  {
    name: "hf-api-key + hf-secret (dual header)",
    headers: () => ({
      "hf-api-key": KEY,
      "hf-secret": SECRET,
      "content-type": "application/json"
    })
  },
  {
    name: "Authorization: Bearer <secret>",
    headers: () => ({
      Authorization: `Bearer ${SECRET}`,
      "content-type": "application/json"
    })
  },
  {
    name: "Authorization: Bearer <key>",
    headers: () => ({
      Authorization: `Bearer ${KEY}`,
      "content-type": "application/json"
    })
  },
  {
    name: "x-api-key: <key> + x-api-secret: <secret>",
    headers: () => ({
      "x-api-key": KEY,
      "x-api-secret": SECRET,
      "content-type": "application/json"
    })
  }
];

// Candidate read endpoints to probe auth cheaply (no generation cost).
const PROBE_ENDPOINTS = [
  "/me",
  "/account",
  "/workspaces",
  "/models",
  "/credits"
];

async function tryRequest(url, init) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: `network: ${err.message}` };
  }
}

async function probeAuth() {
  console.log("\n── Phase 1: probe auth (looking for a 200 from a read endpoint) ──\n");
  for (const base of CANDIDATE_BASES) {
    for (const auth of AUTH_PATTERNS) {
      for (const ep of PROBE_ENDPOINTS) {
        const url = `${base}${ep}`;
        const res = await tryRequest(url, { method: "GET", headers: auth.headers() });
        const flag = res.ok ? "✅" : res.status === 404 ? "  " : "❌";
        console.log(`${flag} ${res.status.toString().padEnd(3)} ${auth.name.padEnd(48)} ${url}`);
        if (res.ok) {
          console.log("    BODY:", JSON.stringify(res.body).slice(0, 300));
          return { base, auth, ep, body: res.body };
        }
      }
    }
  }
  return null;
}

// Candidate image generation endpoint shapes.
const IMAGE_ENDPOINTS = [
  "/image_generations",
  "/image/generations",
  "/images/generations",
  "/generations/image",
  "/soul/generate",
  "/jobs/image"
];

// Minimum-cost image gen prompt.
const TEST_PROMPT = "A photorealistic test image: red apple on a white table, soft lighting. Vertical 9:16.";

async function tryCreateImage(base, authHeaders) {
  console.log("\n── Phase 2: try POST image gen ──\n");
  // Body shape varies. We try the two most common shapes.
  const bodyVariants = [
    { name: "OpenAI-style", body: { prompt: TEST_PROMPT, size: "1024x1024", n: 1 } },
    { name: "Higgsfield-style", body: { prompt: TEST_PROMPT, aspect_ratio: "9:16", model: "soul" } },
    { name: "Verbose-style", body: { prompt: TEST_PROMPT, aspect_ratio: "9:16", num_images: 1, quality: "standard" } }
  ];
  for (const ep of IMAGE_ENDPOINTS) {
    for (const v of bodyVariants) {
      const url = `${base}${ep}`;
      const res = await tryRequest(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(v.body)
      });
      const flag = res.ok ? "✅" : "❌";
      console.log(`${flag} ${res.status.toString().padEnd(3)} ${v.name.padEnd(18)} ${url}`);
      if (res.ok) {
        console.log("    RESPONSE:", JSON.stringify(res.body).slice(0, 600));
        return { url, body: v.body, response: res.body };
      } else if (res.status === 422 || res.status === 400) {
        // 422/400 means the endpoint exists and accepted auth but rejected the body.
        // Print the error so we can adjust shape.
        console.log("    HINT (endpoint exists, body rejected):", JSON.stringify(res.body).slice(0, 300));
      }
    }
  }
  return null;
}

async function pollAndDownload(base, authHeaders, jobId) {
  console.log(`\n── Phase 3: poll job ${jobId} ──\n`);
  const jobEndpoints = [`/jobs/${jobId}`, `/image_generations/${jobId}`, `/generations/${jobId}`];
  let job = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const ep of jobEndpoints) {
      const res = await tryRequest(`${base}${ep}`, { method: "GET", headers: authHeaders() });
      if (res.ok && res.body && typeof res.body === "object") {
        console.log(`    attempt ${attempt + 1}: ${ep} → status=${res.body.status ?? "?"}`);
        if (res.body.status === "completed" || res.body.status === "succeeded" || res.body.assets || res.body.image_url) {
          job = res.body;
          break;
        }
      }
    }
    if (job) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (!job) {
    console.log("  Could not retrieve completed job within timeout.");
    return null;
  }
  console.log("    JOB:", JSON.stringify(job).slice(0, 500));
  // Try common asset URL shapes.
  const assetUrl =
    job.assetUrl ||
    job.asset_url ||
    job.image_url ||
    job.url ||
    job.result?.url ||
    job.assets?.[0]?.url ||
    job.output?.[0]?.url;
  if (!assetUrl) {
    console.log("  No asset URL found in job payload.");
    return null;
  }
  console.log("    Asset URL:", assetUrl);
  const res = await fetch(assetUrl);
  if (!res.ok) {
    console.log(`  Asset download failed: ${res.status}`);
    return null;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const outPath = path.resolve("scripts/higgsfield-smoke-output.png");
  await fs.writeFile(outPath, bytes);
  console.log(`  ✅ Wrote ${bytes.length} bytes to ${outPath}`);
  return outPath;
}

(async () => {
  const auth = await probeAuth();
  if (!auth) {
    console.log("\n❌ Couldn't find a working auth combination. Higgsfield endpoint paths may differ from what's tried here.");
    console.log("   Next step: paste a working curl example from Higgsfield's docs and I'll adapt.");
    process.exit(1);
  }
  console.log(`\n✅ Auth works with: base=${auth.base}, headers=${auth.auth.name}`);

  const imageJob = await tryCreateImage(auth.base, auth.auth.headers);
  if (!imageJob) {
    console.log("\n❌ Couldn't create an image. Auth works but generation endpoint/body shape unknown.");
    process.exit(1);
  }
  // Extract jobId from response shape — multiple field names possible.
  const jobId =
    imageJob.response?.id ||
    imageJob.response?.jobId ||
    imageJob.response?.job_id ||
    imageJob.response?.data?.id;
  if (jobId) {
    await pollAndDownload(auth.base, auth.auth.headers, jobId);
  } else if (imageJob.response?.image_url || imageJob.response?.url) {
    console.log("\n  Synchronous response — no jobId, image returned inline.");
    const url = imageJob.response.image_url || imageJob.response.url;
    const res = await fetch(url);
    if (res.ok) {
      const bytes = Buffer.from(await res.arrayBuffer());
      const outPath = path.resolve("scripts/higgsfield-smoke-output.png");
      await fs.writeFile(outPath, bytes);
      console.log(`  ✅ Wrote ${bytes.length} bytes to ${outPath}`);
    }
  } else {
    console.log("\n  Image gen response didn't include jobId or inline URL — print full body:");
    console.log("  ", JSON.stringify(imageJob.response, null, 2).slice(0, 1500));
  }
})();
