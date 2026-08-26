// Storefront tracking install (BixGrow parity): the /r redirect counts the
// CLICK on Hiloomy's server, but a customer who buys days later in a fresh
// session leaves no link trace on the converting order. The fix is a script
// on the SHOP's domain (public/hiloomy-track.js) that persists the link
// params in a first-party cookie and copies them into cart attributes —
// which the order webhook already parses (agent_click_id / ref / coupon).
//
// Install path A: Shopify ScriptTag via the Admin API (one click, like
// BixGrow does it). Path B fallback: the owner pastes a <script> line into
// theme.liquid — same script, manual install, surfaced in the settings card
// whenever A fails (missing write_script_tags scope, API deprecation, ...).

import { AppError } from "@/lib/server/errors";
import { createShopifyClient } from "@/lib/shopify/client";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import { appBaseUrl } from "@/lib/services/affiliate-signup-service";

export function trackingScriptUrl(): string {
  return `${appBaseUrl()}/hiloomy-track.js`;
}

export function trackingSnippetHtml(): string {
  return `<script src="${trackingScriptUrl()}" defer></script>`;
}

interface ScriptTagNode {
  id: string;
  src: string;
}

const SCRIPT_TAGS_QUERY = `
  query trackingScriptTags($src: URL!) {
    scriptTags(first: 5, src: $src) {
      edges { node { id src } }
    }
  }
`;

const SCRIPT_TAG_CREATE = `
  mutation trackingScriptTagCreate($input: ScriptTagInput!) {
    scriptTagCreate(input: $input) {
      scriptTag { id src }
      userErrors { field message }
    }
  }
`;

export async function getTrackingScriptStatus(storeId: string): Promise<{
  installed: boolean;
  scriptUrl: string;
  snippet: string;
}> {
  const scriptUrl = trackingScriptUrl();
  const base = { scriptUrl, snippet: trackingSnippetHtml() };
  try {
    const credentials = await getStoredShopifyCredentials(storeId);
    const client = createShopifyClient(credentials);
    const data = await client.request<{
      scriptTags: { edges: Array<{ node: ScriptTagNode }> };
    }>(SCRIPT_TAGS_QUERY, { src: scriptUrl });
    return { ...base, installed: data.scriptTags.edges.length > 0 };
  } catch {
    // No credentials / API refusal — status unknown, treat as not installed
    // so the card keeps showing both install paths.
    return { ...base, installed: false };
  }
}

export async function installTrackingScriptTag(storeId: string): Promise<{
  installed: boolean;
  alreadyInstalled: boolean;
  scriptUrl: string;
}> {
  const scriptUrl = trackingScriptUrl();
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);

  const existing = await client.request<{
    scriptTags: { edges: Array<{ node: ScriptTagNode }> };
  }>(SCRIPT_TAGS_QUERY, { src: scriptUrl });
  if (existing.scriptTags.edges.length > 0) {
    return { installed: true, alreadyInstalled: true, scriptUrl };
  }

  const result = await client.request<{
    scriptTagCreate: {
      scriptTag: ScriptTagNode | null;
      userErrors: Array<{ field: string | null; message: string }>;
    };
  }>(SCRIPT_TAG_CREATE, {
    // cache:false — updates to public/hiloomy-track.js take effect on the
    // next deploy without touching the ScriptTag again.
    input: { src: scriptUrl, displayScope: "ONLINE_STORE", cache: false }
  });

  const errors = result.scriptTagCreate.userErrors;
  if (errors.length > 0 || !result.scriptTagCreate.scriptTag) {
    throw new AppError(
      errors.map((e) => e.message).join("; ") || "Shopify rejected the script tag.",
      422
    );
  }
  return { installed: true, alreadyInstalled: false, scriptUrl };
}
