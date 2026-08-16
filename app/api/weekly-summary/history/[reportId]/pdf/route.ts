import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { getInternalBaseUrl } from "@/lib/server/base-url";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";
import { getWeeklyReport } from "@/lib/services/weekly-report-service";

// Re-render a stored weekly/monthly report as a PDF on demand. The data
// JSON is in the WeeklyReport row; we hit the same /print/meta-ads-weekly
// page but pass the periodStart/periodEnd so it queries the underlying
// data and renders for that window. (We rebuild from live data rather
// than persisted JSON so the page always reflects the latest schema.)

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { reportId } = await context.params;
    const bundle = await getWeeklyReport(reportId);
    if (!bundle) {
      return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
    }
    const baseUrl = getInternalBaseUrl(request);
    const url = new URL("/print/meta-ads-weekly", baseUrl);
    url.searchParams.set("from", bundle.periodStart);
    url.searchParams.set("to", bundle.periodEnd);
    url.searchParams.set("storeId", bundle.storeId);
    url.searchParams.set("locale", "he");

    const cookies = request.headers.get("cookie");
    const cookieList = cookies
      ? cookies.split(";").map((c) => {
          const eq = c.indexOf("=");
          return eq === -1
            ? { name: c.trim(), value: "" }
            : { name: c.slice(0, eq).trim(), value: c.slice(eq + 1).trim() };
        })
      : [];

    const pdf = await renderPdfFromUrl({ url: url.toString(), cookies: cookieList });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${bundle.periodStart}_${bundle.periodEnd}.pdf"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
