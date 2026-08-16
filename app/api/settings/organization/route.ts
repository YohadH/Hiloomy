import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { requireOrgAdmin } from "@/lib/auth/guards";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await requireOrgAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      currency?: string;
      billingCountry?: string;
      locale?: string;
    };

    const name = (body.name ?? "").trim().slice(0, 80);
    if (!name) throw new AppError("Organization name is required.", 400);

    const currency = ["ILS", "USD", "EUR", "GBP"].includes((body.currency ?? "").toUpperCase())
      ? (body.currency ?? "").toUpperCase()
      : "ILS";
    const billingCountry = (body.billingCountry ?? "").toUpperCase().slice(0, 2) || null;
    const locale = body.locale === "en" ? "en" : "he";

    const db = getDb();
    await db.organization.update({
      where: { id: orgId },
      data: { name, currency, billingCountry, locale }
    });
    await recordAuditEvent({
      orgId,
      actorUserId: userId,
      eventType: "settings.org_updated",
      description: `Updated organization settings (name="${name}", currency=${currency})`,
      targetType: "organization",
      targetId: orgId
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
