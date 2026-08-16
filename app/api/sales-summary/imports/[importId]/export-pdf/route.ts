import { NextResponse } from "next/server";
import { toErrorMessage, AppError } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getInternalBaseUrl } from "@/lib/server/base-url";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";

// Generates the Offline Status PDF for a given import.
// Mirrors the Meta Ads weekly PDF pattern: spin up Chromium, navigate to
// the print page on this same server, capture A4 PDF, stream back.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

export async function GET(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { importId } = await params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const baseUrl = getInternalBaseUrl(request);
    const url = new URL(`/print/offline-status/${importId}`, baseUrl);
    url.searchParams.set("storeId", storeId);
    // Force Hebrew per the user's requirement.
    url.searchParams.set("locale", "he");

    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const pdf = await renderPdfFromUrl({ url: url.toString(), cookies, format: "A4" });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="offline-status-${importId}.pdf"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
