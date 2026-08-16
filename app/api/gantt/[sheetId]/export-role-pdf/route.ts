// POST /api/gantt/[sheetId]/export-role-pdf?role=designer
//
// Spins up Playwright, navigates the print page filtered to the given
// role, captures as A4 PDF, streams back as a download. Mirrors the
// existing weekly-summary PDF export pattern.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { getInternalBaseUrl } from "@/lib/server/base-url";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";
import { buildContentDisposition } from "@/lib/server/content-disposition";

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
      if (eq === -1) return { name: part, value: "" };
      return { name: part.slice(0, eq), value: part.slice(eq + 1) };
    });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sheetId: string }> }
) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const url = new URL(request.url);
    const role = (url.searchParams.get("role") ?? "").trim();
    const locale = url.searchParams.get("locale") === "en" ? "en" : "he";

    const db = getDb();
    const sheet = await db.ganttSheet.findFirst({
      where: { id: sheetId, storeId },
      select: { id: true, title: true }
    });
    if (!sheet) throw new AppError("Sheet not found.", 404);

    const baseUrl = getInternalBaseUrl(request);
    const printUrl = new URL("/print/gantt-brief", baseUrl);
    printUrl.searchParams.set("sheetId", sheet.id);
    if (role) printUrl.searchParams.set("role", role);
    printUrl.searchParams.set("locale", locale);

    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const pdf = await renderPdfFromUrl({
      url: printUrl.toString(),
      cookies,
      format: "A4"
    });

    const safeRole = role
      ? role.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      : "all";
    const safeTitle = sheet.title
      .toLowerCase()
      .replace(/[^a-z0-9א-ת]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const filename = `gantt-${safeTitle || sheet.id}-${safeRole}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // Hebrew titles (`sheet.title` often is) blow up plain
        // Content-Disposition because HTTP headers are ByteString-only.
        // buildContentDisposition uses RFC 5987 to send both a UTF-8
        // filename and an ASCII fallback.
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
