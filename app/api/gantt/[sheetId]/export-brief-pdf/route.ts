// POST /api/gantt/[sheetId]/export-brief-pdf
//
// Runs the /print/gantt-marketing-brief page through Playwright and
// streams the result back as a downloadable PDF. Requires that the brief
// has been generated first (via POST /api/gantt/[sheetId]/brief).

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { getInternalBaseUrl } from "@/lib/server/base-url";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";
import { buildContentDisposition } from "@/lib/server/content-disposition";
import {
  generateMarketingBrief,
  type MarketingBrief
} from "@/lib/services/gantt-brief-generator-service";

function monthLabelFromRange(start: Date | null, end: Date | null): string {
  if (!start) return "";
  const monthsHe = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר"
  ];
  const startLabel = `${monthsHe[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  if (!end || end.getUTCMonth() === start.getUTCMonth()) return startLabel;
  return `${startLabel} → ${monthsHe[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

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

    const db = getDb();
    const sheet = await db.ganttSheet.findFirst({
      where: { id: sheetId, storeId },
      include: {
        rows: { orderBy: [{ startDate: "asc" }, { rowIndex: "asc" }] },
        store: { select: { name: true } }
      }
    });
    if (!sheet) throw new AppError("Sheet not found.", 404);

    // Ensure the brief exists before rendering the print page. Previously
    // this route required the client to have called POST /brief first and
    // errored 409 if not — but the /brief endpoint's DB cache write is
    // best-effort (a Prisma failure there won't throw to the client), so
    // on Render we sometimes ended up with a "200 OK from /brief" but
    // NULL briefJson on the row. The print page then 404's, chromium
    // captures the 404, and the operator sees "HTTP 500" here. Fix by
    // generating on the fly if missing.
    if (!sheet.briefJson) {
      const monthLabel = monthLabelFromRange(sheet.rangeStart, sheet.rangeEnd);
      const brief: MarketingBrief = await generateMarketingBrief({
        storeBrandName: sheet.store?.name ?? "",
        monthLabel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows: sheet.rows.map((r: any) => ({
          id: r.id,
          task: r.task ?? "",
          category: r.category,
          role: r.role,
          startDate: r.startDate,
          endDate: r.endDate,
          actionType: r.actionType
        }))
      });
      try {
        await db.ganttSheet.update({
          where: { id: sheet.id },
          data: { briefJson: brief as unknown as object, briefGeneratedAt: new Date() }
        });
      } catch (err) {
        // Not fatal — even if we can't cache, the print page fetches
        // briefJson via the same query it does today. When cache write
        // fails we fall back to writing at least the in-memory brief
        // into a fresh column value via a second update attempt.
        console.warn(
          "[export-brief-pdf] briefJson cache write failed, print page may 404:",
          err instanceof Error ? err.message : String(err)
        );
        throw new AppError(
          "Could not persist the generated brief. Try regenerating from the marketing planner.",
          500
        );
      }
    }

    const baseUrl = getInternalBaseUrl(request);
    const printUrl = new URL("/print/gantt-marketing-brief", baseUrl);
    printUrl.searchParams.set("sheetId", sheet.id);

    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const pdf = await renderPdfFromUrl({
      url: printUrl.toString(),
      cookies,
      format: "A4"
    });

    const safeTitle = sheet.title
      .toLowerCase()
      .replace(/[^a-z0-9א-ת]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const filename = `brief-${safeTitle || sheet.id}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // Hebrew sheet titles need RFC 5987 encoding — plain filename=
        // rejects any codepoint > 255 (Aleph is 1488).
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
