// POST /api/gantt/[sheetId]/export-plan-pdf?kind=commercial|role&role=web|all&month=YYYY-MM
//
// Renders /print/plan-brief through headless chromium and streams the PDF.
// Both Plan exports (Monthly Commercial Brief, Role Action Brief) go through
// here; the content comes from Commercial Initiatives, not raw cells.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { getInternalBaseUrl } from "@/lib/server/base-url";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";
import { buildContentDisposition } from "@/lib/server/content-disposition";
import { parseBriefRole } from "@/lib/domain/plan-brief";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseCookieHeader(header: string | null): Array<{ name: string; value: string }> {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      return eq === -1 ? { name: part, value: "" } : { name: part.slice(0, eq), value: part.slice(eq + 1) };
    });
}

export async function POST(request: Request, context: { params: Promise<{ sheetId: string }> }) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") === "role" ? "role" : "commercial";
    const roleParam = (url.searchParams.get("role") ?? "").trim();
    const role = roleParam === "all" ? "all" : parseBriefRole(roleParam);
    if (kind === "role" && !role) throw new AppError("Unknown role.", 400);
    const month = url.searchParams.get("month");
    const locale = url.searchParams.get("locale") === "en" ? "en" : "he";

    const sheet = await getDb().ganttSheet.findFirst({ where: { id: sheetId, storeId }, select: { id: true, title: true } });
    if (!sheet) throw new AppError("Sheet not found.", 404);

    const printUrl = new URL("/print/plan-brief", getInternalBaseUrl(request));
    printUrl.searchParams.set("sheetId", sheet.id);
    printUrl.searchParams.set("kind", kind);
    if (kind === "role") printUrl.searchParams.set("role", role as string);
    if (month && /^\d{4}-\d{2}$/.test(month)) printUrl.searchParams.set("month", month);
    printUrl.searchParams.set("locale", locale);

    const pdf = await renderPdfFromUrl({ url: printUrl.toString(), cookies: parseCookieHeader(request.headers.get("cookie")), format: "A4" });

    const safeTitle = sheet.title.toLowerCase().replace(/[^a-z0-9א-ת]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    const suffix = kind === "commercial" ? "commercial-brief" : `team-${role}`;
    const filename = `plan-${safeTitle || sheet.id}-${suffix}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition(filename),
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store"
      }
    });
  } catch (rawError) {
    const error = friendlyDbError(rawError);
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
