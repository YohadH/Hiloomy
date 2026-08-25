// hiloomy.com/my/{slug}/dashboard — the affiliate's own sales dashboard
// (HLA-12/B9, owner requirement: "the affiliate will have access to a
// dashboard that is only for them that shows them the sales they did").
//
// Session-gated (affiliate cookie, scoped to this slug's store), branded
// per brand, and privacy-clean: amounts and order refs only.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getProgramBySlug } from "@/lib/services/affiliate-signup-service";
import {
  buildAffiliateSelfDashboard,
  type AffiliateRangeKey
} from "@/lib/services/affiliate-dashboard-service";
import {
  AFFILIATE_SESSION_COOKIE,
  verifyAffiliateToken
} from "@/lib/server/affiliate-session";
import { CopyFieldButton } from "@/components/affiliate-join/copy-field";
import { AffiliateLogoutButton } from "@/components/affiliate-join/logout-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const context = await getProgramBySlug(slug).catch(() => null);
  return { title: context ? `הדשבורד שלי · ${context.store.name}` : "הדשבורד שלי" };
}

const STATUS_LABEL: Record<string, string> = {
  unpaid: "ממתין לאישור",
  approved: "מאושר לתשלום",
  paid: "שולם",
  cancelled: "בוטל",
  refunded: "הוחזר"
};

export default async function AffiliateDashboardPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const [{ slug }, { range }] = await Promise.all([params, searchParams]);
  const context = await getProgramBySlug(slug).catch(() => null);
  if (!context) notFound();

  const cookieStore = await cookies();
  const session = verifyAffiliateToken(
    cookieStore.get(AFFILIATE_SESSION_COOKIE)?.value,
    "session"
  );
  if (!session || session.storeId !== context.store.id) {
    redirect(`/my/${encodeURIComponent(slug)}` as never);
  }

  const rangeKey = (["month", "30d", "all"].includes(range ?? "") ? range : "30d") as AffiliateRangeKey;
  const data = await buildAffiliateSelfDashboard({
    memberId: session.memberId,
    storeId: context.store.id,
    rangeKey
  });
  if (!data) redirect(`/my/${encodeURIComponent(slug)}` as never);

  const accent = context.program.brandAccentColor || "#047857";
  const fmt = (n: number) =>
    `₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
  const ranges: Array<{ key: AffiliateRangeKey; label: string }> = [
    { key: "month", label: "החודש" },
    { key: "30d", label: "30 יום" },
    { key: "all", label: "מאז ומעולם" }
  ];

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {/* Header */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>
                {context.store.name}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                היי {data.member.firstName} 👋
              </h1>
              {data.member.status === "pending" ? (
                <p className="mt-1 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  ההרשמה ממתינה לאישור המותג — הקישור שלך כבר עובד ונספר
                </p>
              ) : null}
            </div>
            <AffiliateLogoutButton slug={context.program.signupSlug} />
          </div>

          {/* The promotion tools — front and center */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.member.referralLink ? (
              <CopyFieldButton
                label="הקישור האישי שלך"
                value={data.member.referralLink}
                accent={accent}
              />
            ) : null}
            {data.member.couponCode ? (
              <CopyFieldButton label="קוד הקופון שלך" value={data.member.couponCode} accent={accent} />
            ) : null}
          </div>
        </div>

        {/* Range switch */}
        <div className="flex items-center gap-1.5">
          {ranges.map((r) => (
            <a
              key={r.key}
              href={`/my/${encodeURIComponent(slug)}/dashboard?range=${r.key}`}
              className={
                r.key === data.rangeKey
                  ? "rounded-full px-3 py-1.5 text-xs font-bold text-white"
                  : "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              }
              style={r.key === data.rangeKey ? { background: accent } : undefined}
            >
              {r.label}
            </a>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "מכירות שהבאת", value: fmt(data.kpis.sales) },
            { label: "הזמנות", value: String(data.kpis.orders) },
            { label: "העמלה שלך", value: fmt(data.kpis.commission) },
            {
              label: "קליקים על הקישור",
              value:
                data.kpis.clicks > 0
                  ? `${data.kpis.clicks.toLocaleString("he-IL")}${data.kpis.conversionPct != null ? ` · ${data.kpis.conversionPct}% המרה` : ""}`
                  : "—"
            }
          ].map((tile) => (
            <div key={tile.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{tile.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{tile.value}</p>
            </div>
          ))}
        </div>

        {/* Commission status */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "ממתין לאישור", value: data.commissionByStatus.unpaid, cls: "text-amber-700" },
            { label: "מאושר לתשלום", value: data.commissionByStatus.approved, cls: "text-emerald-700" },
            { label: "שולם", value: data.commissionByStatus.paid, cls: "text-slate-700" }
          ].map((tile) => (
            <div key={tile.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-xs text-slate-500">{tile.label}</p>
              <p className={`mt-1 text-lg font-bold tabular-nums ${tile.cls}`}>{fmt(tile.value)}</p>
            </div>
          ))}
        </div>

        {/* Conversions */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">
            ההזמנות שהגיעו דרכך
          </p>
          {data.conversions.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              עדיין אין הזמנות בטווח הזה — שתפו את הקישור או את הקופון שלכם והן יופיעו כאן.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-start font-semibold">תאריך</th>
                    <th className="px-4 py-2 text-start font-semibold">הזמנה</th>
                    <th className="px-4 py-2 text-end font-semibold">מכירה</th>
                    <th className="px-4 py-2 text-end font-semibold">העמלה שלך</th>
                    <th className="px-4 py-2 text-end font-semibold">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {data.conversions.map((row, i) => (
                    <tr key={`${row.orderRef}-${i}`} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-700">
                        {new Date(row.occurredAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600" dir="ltr">
                        {row.orderRef}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmt(row.salesAmount)}</td>
                      <td className="px-4 py-2 text-end font-semibold tabular-nums" style={{ color: accent }}>
                        {fmt(row.commissionAmount)}
                      </td>
                      <td className="px-4 py-2 text-end text-xs text-slate-600">
                        {STATUS_LABEL[row.payoutStatus] ?? row.payoutStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-400">מופעל על ידי Hiloomy</p>
      </div>
    </main>
  );
}
