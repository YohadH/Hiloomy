// Print-only marketing brief.
// URL: /print/gantt-marketing-brief?sheetId=X
//
// Visual language matches the operator's reference DOCX briefs — pink
// section headers, yellow-highlight headlines for each offer, RTL Hebrew
// layout, big date-range emphasis, coupon-code chips.

import { notFound } from "next/navigation";
import { getDb } from "@/lib/server/db";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import type { MarketingBrief, BriefOffer } from "@/lib/services/gantt-brief-generator-service";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface SearchParams {
  sheetId?: string;
}

function fmt(dateIso: string | null | undefined): string {
  if (!dateIso) return "—";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

function OfferCard({ offer, index }: { offer: BriefOffer; index?: number }) {
  return (
    <div className="offer">
      {/* Yellow highlighted headline — matches the reference PDFs */}
      <div className="offer-head">
        {typeof index === "number" ? <span className="offer-num">{index}.</span> : null}
        <span className="offer-headline">{offer.headline}</span>
      </div>
      {/* Validity chip — the reference briefs emphasize this in bold black */}
      <div className="offer-validity">
        <strong>בתוקף החל מ: </strong>
        {fmt(offer.validityStart)}
        {offer.validityEnd ? (
          <>
            <strong>, עד ה-</strong>
            {fmt(offer.validityEnd)}
            {offer.validityEndTime ? (
              <>
                <strong> בשעה </strong>
                {offer.validityEndTime}
              </>
            ) : null}
          </>
        ) : (
          <strong> · עד גמר המלאי</strong>
        )}
      </div>
      {/* Body copy */}
      {offer.body ? <p className="offer-body">{offer.body}</p> : null}
      {/* Coupon code chip */}
      {offer.couponCode ? (
        <p className="offer-code">
          <strong>קוד קופון: </strong>
          <span className="chip-code">{offer.couponCode}</span>
        </p>
      ) : null}
      {/* URL */}
      {offer.url ? (
        <p className="offer-url">
          <strong>לינק: </strong>
          <a href={offer.url}>{offer.url}</a>
        </p>
      ) : null}
      {/* Owner role + KPI callouts */}
      <div className="offer-meta">
        {offer.ownerRole ? <span className="chip">אחראי: {offer.ownerRole}</span> : null}
        {offer.kpiTarget ? <span className="chip chip-kpi">יעד: {offer.kpiTarget}</span> : null}
      </div>
      {/* Conditions bullets — matches "הטבות קיימות באתר בטווח התאריכים" */}
      {offer.conditions?.length ? (
        <div className="offer-conditions">
          <p className="cond-title">הטבות קיימות באתר בטווח התאריכים:</p>
          <ul>
            {offer.conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* Callouts — critical items highlighted */}
      {offer.callouts?.length
        ? offer.callouts.map((c, i) => (
            <div key={i} className={`callout callout-${c.level}`}>
              <strong>
                {c.level === "critical" ? "⚠ קריטי:" : c.level === "warning" ? "⚡ שימו לב:" : "ℹ"}
              </strong>{" "}
              {c.text}
            </div>
          ))
        : null}
    </div>
  );
}

export default async function MarketingBriefPrintPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await getAuthContext();
  if (!auth.orgId) return notFound();

  const { sheetId } = await searchParams;
  if (!sheetId) return notFound();

  const storeId = await resolveActiveStoreId();
  if (!storeId) return notFound();

  const db = getDb();
  const sheet = await db.ganttSheet.findFirst({
    where: { id: sheetId, storeId },
    select: {
      id: true,
      title: true,
      briefJson: true,
      briefGeneratedAt: true,
      store: { select: { name: true } }
    }
  });
  if (!sheet || !sheet.briefJson) return notFound();

  const brief = sheet.briefJson as unknown as MarketingBrief;
  const brand = sheet.store?.name || brief.header.brandName || "";

  return (
    <html lang="he" dir="rtl">
      <head>
        <title>{`בריף ${brand} — ${brief.header.monthLabel}`}</title>
        <style>{`
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, system-ui, "Segoe UI", "Heebo", "Rubik", sans-serif;
            margin: 0;
            padding: 0;
            color: #0f172a;
            line-height: 1.6;
          }
          .page { max-width: 900px; margin: 0 auto; padding: 40px 44px; }

          /* ── Cover ────────────────────────────────────────────── */
          .cover {
            border-bottom: 3px solid #0f172a;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .cover-brand {
            font-size: 12px;
            font-weight: 700;
            color: #64748b;
            letter-spacing: 2px;
            text-transform: uppercase;
          }
          .cover-title {
            font-size: 28px;
            font-weight: 800;
            margin: 6px 0 4px;
            color: #0f172a;
          }
          .cover-theme {
            font-size: 14px;
            color: #475569;
            font-style: italic;
          }
          .cover-summary {
            margin-top: 14px;
            padding: 12px 14px;
            background: #f8fafc;
            border-inline-start: 4px solid #4f46e5;
            font-size: 13px;
            line-height: 1.7;
            color: #1e293b;
            border-radius: 4px;
          }
          .kpis {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 14px;
          }
          .kpi {
            background: #eef2ff;
            color: #3730a3;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
          }

          /* ── Section headers (pink like the reference PDFs) ───── */
          .section {
            margin-top: 32px;
          }
          .section-header {
            background: #fce7f3;
            color: #831843;
            padding: 8px 14px;
            border-radius: 6px;
            font-size: 15px;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .section-num {
            background: #831843;
            color: #fce7f3;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 800;
          }
          .subsection-header {
            margin: 20px 0 10px;
            font-size: 14px;
            font-weight: 700;
            color: #831843;
            display: inline-block;
            padding: 4px 10px;
            background: #fdf2f8;
            border-radius: 4px;
          }
          .influencer-name {
            margin: 22px 0 12px;
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
            padding-bottom: 6px;
            border-bottom: 2px dashed #cbd5e1;
          }

          /* ── Offer card ──────────────────────────────────────── */
          .offer {
            margin-top: 14px;
            padding: 14px 16px;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            page-break-inside: avoid;
          }
          .offer-head {
            background: #fef9c3;
            color: #713f12;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 800;
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 8px;
          }
          .offer-num {
            color: #a16207;
          }
          .offer-headline {
            flex: 1;
          }
          .offer-validity {
            font-size: 12px;
            color: #0f172a;
            margin-bottom: 6px;
            background: #fff7ed;
            padding: 4px 10px;
            border-radius: 4px;
            border-inline-start: 3px solid #f97316;
          }
          .offer-body {
            font-size: 13px;
            color: #1e293b;
            white-space: pre-wrap;
            margin: 8px 0;
            line-height: 1.65;
          }
          .offer-code {
            font-size: 12px;
            margin: 4px 0;
          }
          .chip-code {
            font-family: "SF Mono", ui-monospace, monospace;
            background: #0f172a;
            color: #fef9c3;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
          }
          .offer-url { font-size: 11px; margin: 4px 0; word-break: break-all; }
          .offer-url a { color: #4f46e5; }
          .offer-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .chip {
            display: inline-block;
            background: #f1f5f9;
            color: #334155;
            padding: 3px 8px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
          }
          .chip-kpi { background: #dcfce7; color: #14532d; }
          .offer-conditions {
            margin-top: 10px;
            font-size: 11px;
          }
          .cond-title {
            font-weight: 700;
            color: #475569;
            text-decoration: underline;
            margin: 0 0 4px;
          }
          .offer-conditions ul {
            margin: 0;
            padding-inline-start: 20px;
          }
          .offer-conditions li {
            margin: 2px 0;
            color: #475569;
          }

          /* ── Callouts ────────────────────────────────────────── */
          .callout {
            margin-top: 8px;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 11px;
            line-height: 1.5;
          }
          .callout-critical { background: #fee2e2; color: #991b1b; border-inline-start: 3px solid #dc2626; }
          .callout-warning  { background: #fef3c7; color: #92400e; border-inline-start: 3px solid #f59e0b; }
          .callout-info     { background: #e0f2fe; color: #075985; border-inline-start: 3px solid #0284c7; }

          /* ── Permanent offers ────────────────────────────────── */
          .permanent-block {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 12px 14px;
            margin-top: 10px;
          }
          .permanent-title {
            font-size: 13px;
            font-weight: 700;
            color: #831843;
            background: #fdf2f8;
            padding: 3px 10px;
            border-radius: 4px;
            display: inline-block;
            margin-bottom: 6px;
          }
          .permanent-text { font-size: 12px; color: #1e293b; margin: 4px 0; }

          /* ── UGC ─────────────────────────────────────────────── */
          .ugc {
            background: #ede9fe;
            border: 1px solid #c4b5fd;
            padding: 14px 16px;
            border-radius: 10px;
            margin-top: 14px;
          }
          .ugc ol { margin: 0; padding-inline-start: 22px; }
          .ugc li { font-size: 13px; color: #4c1d95; margin: 4px 0; }

          /* ── Footer ─────────────────────────────────────────── */
          .footer {
            margin-top: 40px;
            padding-top: 14px;
            border-top: 1px solid #e2e8f0;
            color: #94a3b8;
            font-size: 10px;
            text-align: center;
          }
          @media print {
            .section-header, .offer-head, .offer-validity, .kpi, .chip, .chip-code,
            .callout-critical, .callout-warning, .callout-info, .ugc, .subsection-header,
            .permanent-title, .cover-summary {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        `}</style>
      </head>
      <body>
        <div className="page">
          {/* Cover */}
          <div className="cover">
            <div className="cover-brand">{brand}</div>
            <div className="cover-title">בריף {brand} // {brief.header.monthLabel}</div>
            {brief.header.theme ? <div className="cover-theme">{brief.header.theme}</div> : null}
            {brief.header.campaignSummary ? (
              <div className="cover-summary">{brief.header.campaignSummary}</div>
            ) : null}
            {brief.header.kpis && brief.header.kpis.length > 0 ? (
              <div className="kpis">
                {brief.header.kpis.map((k, i) => (
                  <span key={i} className="kpi">
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Section 1 — Permanent offers */}
          <section className="section">
            <div className="section-header">
              <span className="section-num">1</span>
              הטבות קבועות — אונליין כללי
            </div>
            <div className="permanent-block">
              <div className="permanent-title">משלוחים — קבוע</div>
              <p className="permanent-text">{brief.permanentOffers.shipping.text}</p>
              {brief.permanentOffers.shipping.conditions?.map((c, i) => (
                <p key={i} className="permanent-text">• {c}</p>
              ))}
            </div>
            <div className="permanent-block">
              <div className="permanent-title">הצטרפות למועדון — קבוע</div>
              <p className="permanent-text">{brief.permanentOffers.memberSignup.text}</p>
              {brief.permanentOffers.memberSignup.couponCode ? (
                <p className="permanent-text">
                  קוד להטבה: <span className="chip-code">{brief.permanentOffers.memberSignup.couponCode}</span>
                </p>
              ) : null}
              {brief.permanentOffers.memberSignup.conditions?.map((c, i) => (
                <p key={i} className="permanent-text">• {c}</p>
              ))}
            </div>
            <div className="permanent-block">
              <div className="permanent-title">הנחת עגלה נטושה</div>
              <p className="permanent-text">{brief.permanentOffers.abandonedCart.text}</p>
              {brief.permanentOffers.abandonedCart.couponCode ? (
                <p className="permanent-text">
                  קוד להטבה: <span className="chip-code">{brief.permanentOffers.abandonedCart.couponCode}</span>
                </p>
              ) : null}
              {brief.permanentOffers.abandonedCart.conditions?.map((c, i) => (
                <p key={i} className="permanent-text">• {c}</p>
              ))}
            </div>
          </section>

          {/* Section 2 — Influencer coupon codes */}
          {brief.influencerBlocks.length > 0 ? (
            <section className="section">
              <div className="section-header">
                <span className="section-num">2</span>
                בריף הטבות אונליין — קודי קופון משפיענים
              </div>
              {brief.influencerBlocks.map((block, i) => (
                <div key={i}>
                  <div className="influencer-name">{block.influencerName}</div>
                  {block.offers.map((offer, j) => (
                    <OfferCard key={j} offer={offer} />
                  ))}
                </div>
              ))}
            </section>
          ) : null}

          {/* Section 3 — Site discounts */}
          {brief.siteDiscounts.length > 0 ? (
            <section className="section">
              <div className="section-header">
                <span className="section-num">3</span>
                הנחה מובנית באתר
              </div>
              {brief.siteDiscounts.map((offer, i) => (
                <OfferCard key={i} offer={offer} index={i + 1} />
              ))}
            </section>
          ) : null}

          {/* Section 4 — Paid promotion brief */}
          {brief.paidPromotion.campaigns.length > 0 || brief.paidPromotion.budgetSummary ? (
            <section className="section">
              <div className="section-header">
                <span className="section-num">4</span>
                בריף קידום ממומן
              </div>
              {brief.paidPromotion.budgetSummary || brief.paidPromotion.roasTarget ? (
                <div className="permanent-block">
                  {brief.paidPromotion.budgetSummary ? (
                    <p className="permanent-text">
                      <strong>תקציב: </strong>
                      {brief.paidPromotion.budgetSummary}
                    </p>
                  ) : null}
                  {brief.paidPromotion.roasTarget ? (
                    <p className="permanent-text">
                      <strong>יעד ROAS: </strong>
                      {brief.paidPromotion.roasTarget}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {brief.paidPromotion.campaigns.map((offer, i) => (
                <OfferCard key={i} offer={offer} />
              ))}
            </section>
          ) : null}

          {/* Section 5 — UGC content */}
          {brief.ugcContent.length > 0 ? (
            <section className="section">
              <div className="section-header">
                <span className="section-num">5</span>
                תוכן UGC {brand}
              </div>
              <div className="ugc">
                <ol>
                  {brief.ugcContent.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ol>
              </div>
            </section>
          ) : null}

          <p className="footer">
            הופק אוטומטית · {brief.rowCount} משימות בגאנט · {new Date(brief.generatedAt).toLocaleString("he-IL")}
          </p>
        </div>
      </body>
    </html>
  );
}
