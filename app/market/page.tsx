import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StatusPill } from "@/components/decisions/status-pill";
import { QualityTag } from "@/components/decisions/evidence";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildMarketView } from "@/lib/services/decision-inbox-service";
import { getAppLocale } from "@/lib/i18n";
import type { CompetitorMarketSignals } from "@/lib/clients/rivalsweeper-client";

export const dynamic = "force-dynamic";

// One quiet line per competitor from the provider reports that are actually
// populated: price cuts, out-of-stock events, active ads, catalog price.
function MarketSignals({ market, lc }: { market: CompetitorMarketSignals | null; lc: "he" | "en" }) {
  if (!market) return null;
  const t = (he: string, en: string) => (lc === "he" ? he : en);
  const parts: string[] = [];
  if (market.markdowns.count > 0) {
    parts.push(
      market.markdowns.maxDropPct !== null
        ? t(`${market.markdowns.count} הורדות מחיר · עד ${Math.round(market.markdowns.maxDropPct)}%`, `${market.markdowns.count} price cuts · up to ${Math.round(market.markdowns.maxDropPct)}%`)
        : t(`${market.markdowns.count} הורדות מחיר`, `${market.markdowns.count} price cuts`)
    );
  }
  if (market.outOfStock.count > 0) parts.push(t(`${market.outOfStock.count} אזלו מהמלאי`, `${market.outOfStock.count} out of stock`));
  if (market.adPresence && market.adPresence.activeAds > 0) parts.push(t(`${market.adPresence.activeAds} מודעות פעילות`, `${market.adPresence.activeAds} active ads`));
  if (market.priceIndex && market.priceIndex.medianPrice !== null) {
    parts.push(t(`מחיר חציוני ₪${Math.round(market.priceIndex.medianPrice)}`, `median ₪${Math.round(market.priceIndex.medianPrice)}`));
    if (market.priceIndex.onSalePct !== null) parts.push(t(`${market.priceIndex.onSalePct}% במבצע`, `${market.priceIndex.onSalePct}% on sale`));
  }
  if (parts.length === 0) return null;
  return <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

// Market — competitor signals as INPUTS to commercial decisions. Each
// relevant event is shown next to your own sales, conversion and exposure,
// and points at the decision it feeds. Not a competitor feed.
export default async function MarketPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lc = isHe ? "he" : "en";
  const t = (he: string, en: string) => (isHe ? he : en);
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const [chrome, market] = await Promise.all([getAppChromeData(), buildMarketView(storeId)]);
  const v = market.pulse.velocityChangePct;
  const velocity =
    v === null ? null : Math.abs(v) < 0.05 ? t("יציב", "stable") : v > 0 ? t(`עלייה ${Math.round(v * 100)}%`, `up ${Math.round(v * 100)}%`) : t(`ירידה ${Math.round(-v * 100)}%`, `down ${Math.round(-v * 100)}%`);
  const conversion = market.pulse.conversionRate === null ? null : `${(market.pulse.conversionRate * 100).toFixed(1)}%`;

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-8">
        <PageHead
          eyebrow={t("שוק", "Market")}
          title={t("אותות שוק כקלט להחלטות", "Market signals as decision inputs")}
          description={t(
            "מידע על מתחרים הוא ראיה תומכת, לא המוצר. הילומי מדווחת רק על אירועים שיש להם משמעות מסחרית מול הנתונים שלכם.",
            "Competitor data is supporting evidence, not the product. Hiloomy reports only the events that matter commercially against your own numbers."
          )}
        />

        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t(`${market.detected} אירועי מתחרים זוהו השבוע`, `${market.detected} competitor event${market.detected === 1 ? "" : "s"} detected this week`)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(`${market.relevant} רלוונטיים מסחרית · ${market.suppressed} הושתקו · ${market.tracked} מתחרים במעקב`, `${market.relevant} commercially relevant · ${market.suppressed} suppressed · ${market.tracked} competitors tracked`)}
            {market.crawl ? (
              <span suppressHydrationWarning>
                {" · "}
                {t("סריקה אחרונה", "Last crawl")}: {new Date(market.crawl.at).toLocaleDateString(isHe ? "he-IL" : "en-US", { month: "short", day: "numeric" })}
              </span>
            ) : null}
          </p>
        </div>

        {market.tracked === 0 ? (
          <Card className="p-8 text-sm text-muted-foreground">
            {t("עדיין לא הוגדרו מתחרים למעקב. ", "No competitors are being monitored yet. ")}
            <Link href={"/settings" as never} className="font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300">
              {t("להוסיף מתחרים בהגדרות", "Add competitors in Settings")}
            </Link>
          </Card>
        ) : market.events.length === 0 ? (
          <Card className="p-8 text-sm text-muted-foreground">
            {t("לא זוהו אירועים עם משמעות מסחרית השבוע. המתחרים במעקב לא פתחו או העמיקו מבצעים.", "No commercially relevant events this week. Tracked competitors did not open or deepen promotions.")}
          </Card>
        ) : (
          <div className="space-y-4">
            {market.events.map((e) => (
              <Card key={e.competitorId} className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("אות שוק", "Market signal")}</p>
                  <h3 className="text-xl font-semibold tracking-tight">{e.name}</h3>
                  <p className="text-base font-medium">
                    {e.changeKind === "opened_promo"
                      ? t(`מבצע${e.maxDiscountPct !== null ? ` של ${e.maxDiscountPct}%` : ""} התחיל`, `${e.maxDiscountPct !== null ? `${e.maxDiscountPct}% ` : ""}promotion started`)
                      : t(`ההנחה הועמקה${e.maxDiscountPct !== null ? ` ל־${e.maxDiscountPct}%` : ""}`, `discount deepened${e.maxDiscountPct !== null ? ` to ${e.maxDiscountPct}%` : ""}`)}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">{e.summary[lc]}</p>
                  <MarketSignals market={e.market} lc={lc} />
                  {e.homepageMessage ? <p className="text-xs text-muted-foreground">“{e.homepageMessage}”</p> : null}
                  <div className="space-y-1 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("מוצר תואם", "Matched to")}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{t("התאמה למוצר שלכם עדיין לא זמינה", "Match to your SKU not available yet")}</span>
                      <QualityTag quality="unavailable" locale={lc} />
                    </div>
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">{t("משמעות מסחרית", "Commercial relevance")}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">{t("המכירות שלכם", "Your sales")}</dt>
                    <dd className="flex items-center gap-2 font-semibold">
                      {velocity ?? t("לא זמין", "unavailable")}
                      <QualityTag quality={v === null ? "unavailable" : "calculated"} locale={lc} />
                    </dd>
                    <dt className="text-muted-foreground">{t("ההמרה שלכם", "Your conversion")}</dt>
                    <dd className="flex items-center gap-2 font-semibold">
                      {conversion ?? t("לא זמין", "unavailable")}
                      <QualityTag quality={market.pulse.conversionQuality} locale={lc} />
                    </dd>
                    <dt className="text-muted-foreground">{t("חשיפת הכנסה", "Revenue exposure")}</dt>
                    <dd className="flex items-center gap-2 font-semibold">
                      {t("לא זמין", "unavailable")}
                      <QualityTag quality="unavailable" locale={lc} />
                    </dd>
                    <dt className="text-muted-foreground">{t("החלטה", "Decision")}</dt>
                    <dd>{e.decisionStatus ? <StatusPill status={e.decisionStatus} locale={lc} /> : <span className="text-muted-foreground">{t("טרם נוצרה", "Not created yet")}</span>}</dd>
                  </dl>
                  {e.decisionId ? (
                    <Link
                      href={`/today/${e.decisionId}` as never}
                      className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90"
                    >
                      {t("לראות את ההחלטה", "View decision")}
                    </Link>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}

        {market.tracked > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={t("מצב השוק", "Market state")}
              title={t("מה הספק רואה אצל כל מתחרה השבוע", "What the provider sees at each competitor this week")}
              hint={t(
                "הורדות מחיר, מוצרים שאזלו, מודעות פעילות ומחיר קטלוג. עובדות, לא החלטות — החלטה נפתחת רק כשיש שינוי מול השבוע הקודם.",
                "Price cuts, stockouts, active ads and catalog price. Facts, not decisions — a decision opens only when something changed versus last week."
              )}
            />
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-start">{t("מתחרה", "Competitor")}</th>
                      <th className="px-4 py-2.5 text-start">{t("מול שבוע שעבר", "vs last week")}</th>
                      <th className="px-4 py-2.5 text-end">{t("הורדות מחיר", "Price cuts")}</th>
                      <th className="px-4 py-2.5 text-end">{t("הנחה מקסימלית", "Deepest cut")}</th>
                      <th className="px-4 py-2.5 text-end">{t("מהקטלוג במבצע", "Catalog on sale")}</th>
                      <th className="px-4 py-2.5 text-end">{t("אזלו מהמלאי", "Out of stock")}</th>
                      <th className="px-4 py-2.5 text-end">{t("מודעות פעילות", "Active ads")}</th>
                      <th className="px-4 py-2.5 text-end">{t("מחיר חציוני", "Median price")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {[...market.events.map((e) => ({ name: e.name, domain: e.domain, summary: e.summary, market: e.market, event: true })), ...market.quiet.map((q) => ({ ...q, event: false }))]
                      .sort((a, b) => Number(b.event) - Number(a.event) || (b.market?.priceIndex?.onSalePct ?? 0) - (a.market?.priceIndex?.onSalePct ?? 0) || (b.market?.markdowns.count ?? 0) - (a.market?.markdowns.count ?? 0))
                      .map((r) => {
                        const m = r.market;
                        const cell = (v: string | null) => <span className={v === null ? "text-muted-foreground" : "tabular-nums"}>{v ?? "—"}</span>;
                        return (
                          <tr key={r.domain} className={r.event ? "bg-emerald-50/40 dark:bg-emerald-500/5" : undefined}>
                            <td className="px-4 py-3">
                              <p className="font-semibold">{r.name}</p>
                              <p className="text-xs text-muted-foreground" dir="ltr">{r.domain}</p>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{r.summary[lc]}</td>
                            <td className="px-4 py-3 text-end">{cell(m && m.markdowns.count > 0 ? String(m.markdowns.count) : null)}</td>
                            <td className="px-4 py-3 text-end">{cell(m && m.markdowns.maxDropPct !== null ? `${Math.round(m.markdowns.maxDropPct)}%` : null)}</td>
                            <td className="px-4 py-3 text-end">{cell(m?.priceIndex && m.priceIndex.onSalePct !== null ? `${m.priceIndex.onSalePct}%` : null)}</td>
                            <td className="px-4 py-3 text-end">{cell(m && m.outOfStock.count > 0 ? String(m.outOfStock.count) : null)}</td>
                            <td className="px-4 py-3 text-end">{cell(m?.adPresence ? String(m.adPresence.activeAds) : null)}</td>
                            <td className="px-4 py-3 text-end">{cell(m?.priceIndex && m.priceIndex.medianPrice !== null ? `₪${Math.round(m.priceIndex.medianPrice)}` : null)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="text-xs text-muted-foreground">
              {t("— = הספק לא מדווח על הנתון הזה עבור המתחרה. מספרים לפי הסריקה האחרונה של הספק.", "— = the provider does not report this for that competitor. Numbers are from the provider's latest crawl.")}
            </p>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
