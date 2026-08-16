import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { getInternalBaseUrl } from "@/lib/server/base-url";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";

// POST /api/weekly-summary/export/meta-ads-pdf
// Body (optional JSON): { from?: "YYYY-MM-DD", to?: "YYYY-MM-DD", storeId?: string }
//
// Spins up chromium, navigates to /print/meta-ads-weekly?... on this same
// server, captures the result as A4 PDF, and streams it back as a download.
// The headless browser forwards the caller's cookies so the print page sees
// the same authenticated session — without this, resolving the active store
// from a session cookie would fail.

export const dynamic = "force-dynamic";
// PDFs can take 60-90s in dev mode (first-compile + OpenAI insight calls +
// influencer aggregation). Production is much faster. Headroom set wide to
// avoid timing out the route itself while the page loads.
export const maxDuration = 300;

interface ExportBody {
  from?: string;
  to?: string;
  storeId?: string;
  locale?: "he" | "en";
  // true → the extended report with the diagnostic/deep-dive appendix
  // (reconciliation, product rollup, brand deep dives, Instagram, affiliates).
  appendix?: boolean;
}

function buildPrintUrl(baseUrl: string, body: ExportBody): string {
  const url = new URL("/print/meta-ads-weekly", baseUrl);
  if (body.from) url.searchParams.set("from", body.from);
  if (body.to) url.searchParams.set("to", body.to);
  if (body.storeId) url.searchParams.set("storeId", body.storeId);
  if (body.appendix) url.searchParams.set("appendix", "1");
  // Force Hebrew for the printable report regardless of the caller's session.
  // The report is built for an Israeli founder; English was only ever the
  // default for sessions that hadn't picked a locale yet.
  url.searchParams.set("locale", body.locale ?? "he");
  return url.toString();
}

function parseCookieHeader(header: string | null): Array<{ name: string; value: string }> {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return { name: part, value: "" };
      return { name: part.slice(0, eq), value: part.slice(eq + 1) };
    });
}

function suggestFilename(body: ExportBody): string {
  const range = body.from && body.to ? `${body.from}_${body.to}` : new Date().toISOString().slice(0, 10);
  return `meta-ads-weekly-${range}.pdf`;
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const body: ExportBody = await request.json().catch(() => ({}));

    const baseUrl = getInternalBaseUrl(request);
    const printUrl = buildPrintUrl(baseUrl, body);
    const cookies = parseCookieHeader(request.headers.get("cookie"));

    const pdf = await renderPdfFromUrl({
      url: printUrl,
      cookies,
      format: "A4"
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${suggestFilename(body)}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
