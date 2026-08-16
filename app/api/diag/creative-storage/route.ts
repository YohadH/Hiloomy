// Diagnostic endpoint — reports the current Creative storage configuration
// so we can see what's actually live in a given environment without
// guessing. Hit `GET /api/diag/creative-storage` and look at the JSON.
//
// Security: requires an authenticated Shopify store session. Returns only
// env-var PRESENCE booleans and safe host extractions (no secret values).

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function maskHost(value: string | undefined): string {
  if (!value) return "(unset)";
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.host;
  } catch {
    return value.slice(0, 40) + (value.length > 40 ? "…" : "");
  }
}

function isProbablyR2Endpoint(host: string): boolean {
  return host.endsWith(".r2.cloudflarestorage.com");
}

function isProbablyTunnel(host: string): boolean {
  return host.endsWith(".trycloudflare.com");
}

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const backendRaw = (process.env.CREATIVE_STORAGE_BACKEND ?? "local").toLowerCase();
  const backend = backendRaw === "s3" || backendRaw === "r2" ? "s3" : "local";
  const endpoint = process.env.CREATIVE_S3_ENDPOINT;
  const endpointHost = maskHost(endpoint);

  // Sanity checks — flag the common misconfigurations.
  const warnings: string[] = [];
  if (backend === "local") {
    warnings.push(
      "CREATIVE_STORAGE_BACKEND is 'local' (or unset). On Render this means files are stored on ephemeral disk — they vanish on every deploy/restart. Set CREATIVE_STORAGE_BACKEND=s3 for production."
    );
  }
  if (backend === "s3" && !endpoint) {
    warnings.push("CREATIVE_S3_ENDPOINT is empty — R2/S3 calls will hit AWS default. Set it to your R2 endpoint.");
  }
  if (backend === "s3" && endpoint && isProbablyTunnel(endpointHost)) {
    warnings.push(
      `CREATIVE_S3_ENDPOINT is pointing at a Cloudflare TUNNEL (${endpointHost}). This is almost certainly wrong — it should point at your R2 storage endpoint (xxx.r2.cloudflarestorage.com), NOT the BI agent tunnel.`
    );
  }
  if (backend === "s3" && endpoint && !isProbablyR2Endpoint(endpointHost) && !endpointHost.includes("amazonaws")) {
    warnings.push(
      `CREATIVE_S3_ENDPOINT (${endpointHost}) doesn't look like an R2 or AWS S3 host. Double-check.`
    );
  }

  return NextResponse.json({
    ok: true,
    storage: {
      backend,
      endpointHost,
      region: process.env.CREATIVE_S3_REGION ?? "(default: auto)",
      bucket: process.env.CREATIVE_BUCKET ?? "(unset)",
      hasAccessKey: Boolean(process.env.CREATIVE_S3_ACCESS_KEY_ID?.trim()),
      hasSecretKey: Boolean(process.env.CREATIVE_S3_SECRET_ACCESS_KEY?.trim()),
      localDir: process.env.CREATIVE_STORAGE_LOCAL_DIR ?? "(default: .creative-storage)"
    },
    biAgent: {
      url: maskHost(process.env.BI_AGENT_URL),
      hasToken: Boolean(process.env.BI_AGENT_TOKEN?.trim())
    },
    creativeAgent: {
      // If CREATIVE_AGENT_URL is set → dedicated tunnel mode.
      // If not → shared with BI agent, routed to /creative/ask on BI_AGENT_URL.
      mode: process.env.CREATIVE_AGENT_URL?.trim() ? "dedicated" : "shared-with-bi",
      url: maskHost(process.env.CREATIVE_AGENT_URL || process.env.BI_AGENT_URL),
      path: process.env.CREATIVE_AGENT_PATH?.trim()
        || (process.env.CREATIVE_AGENT_URL?.trim() ? "/ask" : "/creative/ask"),
      hasToken: Boolean(
        process.env.CREATIVE_AGENT_TOKEN?.trim() || process.env.BI_AGENT_TOKEN?.trim()
      ),
      usingDedicatedToken: Boolean(process.env.CREATIVE_AGENT_TOKEN?.trim())
    },
    higgsfield: {
      hasApiKey: Boolean(process.env.HIGGSFIELD_API_KEY?.trim()),
      hasApiSecret: Boolean(process.env.HIGGSFIELD_API_SECRET?.trim())
    },
    openai: {
      hasApiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
      model: process.env.OPENAI_IMAGE_MODEL ?? "(default: gpt-image-1)"
    },
    warnings
  });
}
