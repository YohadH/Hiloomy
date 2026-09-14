// /plan/initiative/[id] — one commercial initiative: what was planned, the
// entities it maps to (confirm / remove), its live reality, what Hiloomy
// cannot answer yet, and the decisions it produced. ?sheet=<sheetId>
// (defaults to the plan covering today).

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { InitiativeRealityPanel } from "@/components/plan/initiative-reality-panel";
import { EntityLinkButton } from "@/components/plan/entity-link-controls";
import { ContextResolution } from "@/components/plan/context-resolution";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildPlanView, currentPlanSheetId } from "@/lib/services/plan-service";
import { buildInitiativeReality, loadRealityInputs, summarizeReality } from "@/lib/services/initiative-reality-service";
import { BASIS_LABEL, MAPPING_KIND_LABEL, type MappingKind } from "@/lib/domain/initiative-reality";
import { INITIATIVE_STATUS_LABEL } from "@/lib/domain/plan";
import { displayDecisionId } from "@/lib/domain/decision";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KINDS: MappingKind[] = ["product", "gift_product", "discount", "meta_campaign"];

export default async function InitiativePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sheet?: string }> }) {
  const locale = (await getAppLocale()) as "he" | "en";
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const fwd = isHe ? "←" : "→";
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const { id } = await params;
  const { sheet } = await searchParams;
  const now = new Date();
  const sheetId = sheet ?? (await currentPlanSheetId(storeId, now));
  if (!sheetId) notFound();
  const [chrome, plan] = await Promise.all([getAppChromeData(), buildPlanView(storeId, sheetId, now).catch(() => null)]);
  const initiative = plan?.initiatives.find((i) => i.id === id);
  if (!plan || !initiative) notFound();
  const inputs = await loadRealityInputs(storeId, sheetId, now);
  const reality = await buildInitiativeReality(storeId, initiative, inputs, now);
  const summary = summarizeReality(reality, initiative.offer);
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-10">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href={"/marketing-planner" as never} className="underline-offset-4 hover:underline">
              {t("התוכנית המסחרית", "Commercial plan")} {fwd}
            </Link>
            <Link href={`/plan/initiative?sheet=${sheetId}` as never} className="underline-offset-4 hover:underline">
              {t("כל היוזמות", "All initiatives")} {fwd}
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">{t("יוזמה מסחרית", "Commercial initiative")}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{initiative.title}</h1>
          <p className="text-sm text-muted-foreground">
            {fmt(initiative.start)} – {fmt(initiative.end)} · {INITIATIVE_STATUS_LABEL[initiative.status][locale]}
            {initiative.offer.discountPct !== null ? ` · ${initiative.offer.discountPct}%` : ""}
            {initiative.offer.couponCode ? ` · ${initiative.offer.couponCode}` : ""}
            {initiative.channels.length ? ` · ${initiative.channels.join(", ")}` : ""}
          </p>
        </div>

        {/* 0 — Context resolution: what Hiloomy needs before it can evaluate */}
        {reality.context.required > 0 || reality.context.rows.some((r) => r.action !== "none") ? (
          <section id="context" className="space-y-3">
            <ContextResolution sheetId={sheetId} initiativeId={initiative.id} initiativeTitle={initiative.title} context={reality.context} links={reality.mappings.links} locale={locale} />
          </section>
        ) : null}

        {/* 1 — Definition: the plan's own words */}
        <section className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{t("מה תוכנן", "What was planned")}</h2>
          <ul className="space-y-1 text-sm">
            {initiative.executions.slice(0, 8).map((e) => (
              <li key={e.key} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">{e.channel ?? "—"}</span>
                <span>{e.text}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmt(e.start)}
                  {e.end !== e.start ? ` – ${fmt(e.end)}` : ""} · {e.state === "done" ? t("בוצע", "done") : t("פתוח", "open")}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("יעד", "Goal")}: {summary.goalNote[locale]}</p>
        </section>

        {/* 2 — Entity mappings: confirmed / suggested / missing */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">{t("למה היוזמה מתייחסת", "What the initiative refers to")}</h2>
          <p className="text-sm text-muted-foreground">{t("מאושר = ראיה מלאה. זוהה אוטומטית = ראיה חזקה (שם מוצר מדויק, קמפיין מקושר למוצר) שמשמשת כאומדן עד שתאשרו. הצעה = התאמה חלשה, לא משמשת בכלל.", "Confirmed = full evidence. Auto-matched = strong evidence (exact product name, campaign linked to the product) used as an estimate until you confirm. Suggested = a weak match, never used.")}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {KINDS.map((kind) => {
              const links = reality.mappings.links.filter((l) => l.kind === kind);
              const k = reality.mappings.byKind[kind];
              return (
                <Card key={kind} className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{MAPPING_KIND_LABEL[kind][locale]}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", k.state === "confirmed" ? "bg-success/15 text-success" : k.state === "provisional" ? "bg-warning/15 text-warning" : k.state === "suggested" ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground")}>
                      {k.state === "confirmed" ? "✓ " : k.state === "provisional" ? "≈ " : k.state === "suggested" ? "? " : "✕ "}
                      {k.detail[locale]}
                    </span>
                  </div>
                  {links.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {links.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <span className="font-medium">{l.label}</span>
                            <span className={cn("ms-2 rounded px-1.5 py-0.5 text-[11px]", l.state === "confirmed" ? "bg-success/15 text-success" : l.state === "provisional" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{BASIS_LABEL[l.state][locale]}</span>
                            <span className="block text-xs text-muted-foreground">
                              {l.reason[locale]} · {t("כלל", "rule")}: {l.provenance.rule}
                              {l.provenance.auto ? ` (${t("במקור", "originally")} ${l.provenance.auto})` : ""} · {t("התאמה על", "matched on")}: {l.provenance.matchedOn}
                            </span>
                          </span>
                          {l.state !== "confirmed" ? (
                            <EntityLinkButton sheetId={sheetId} initiativeId={initiative.id} kind={kind} id={l.id} label={l.label} via={l.provenance.rule} mode="link" text={t("אשר מיפוי", "Confirm mapping")} />
                          ) : (
                            <EntityLinkButton sheetId={sheetId} initiativeId={initiative.id} kind={kind} id={l.id} label={l.label} mode="unlink" text={t("הסר", "Remove")} />
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{kind === "meta_campaign" ? t("לא נמצא קמפיין שמתאים לשם היוזמה. לקישור ידני: קישורי קמפיין–מוצר בהגדרות.", "No campaign matches the initiative's name. Link manually via campaign–product links in Settings.") : kind === "discount" ? t("אין קופון ממופה.", "No coupon mapped.") : t("לא נמצא מוצר בשם הזה בקטלוג.", "No catalogue product with this name.")}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </section>

        {/* 3–5 — Live status, metrics, missing evidence */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">{t("מצב היוזמה עכשיו", "Initiative reality now")}</h2>
          <InitiativeRealityPanel r={summary} locale={locale} now={now} showPlan={false} />
        </section>

        {/* 6–7 — Decisions and history */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">{t("החלטות של היוזמה", "This initiative's decisions")}</h2>
          {reality.candidateFinding ? (
            <p className="text-sm">
              <span className="font-medium text-warning">{t("מועמד להחלטה", "Decision candidate")}:</span> {reality.candidateFinding.question[locale]}
              <span className="block text-xs text-muted-foreground">{t("הממצא נכנס למסלול המועמדים (ניקוד, איחוד, דירוג, סף). הוא מגיע להיום רק אם הוא עובר את הסף מול שאר המועמדים.", "The finding enters the candidate pipeline (scoring, clustering, ranking, threshold). It reaches Today only if it passes the threshold against every other candidate.")}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("אין כרגע ממצא שמצדיק מועמד להחלטה.", "No finding currently justifies a decision candidate.")}</p>
          )}
          {initiative.relatedDecisions.length ? (
            <ul className="divide-y divide-border">
              {initiative.relatedDecisions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium">{r.question[locale]}</span>
                    <span className="text-xs text-muted-foreground"> · {r.state === "open" ? t("פתוחה", "open") : t("נסגרה", "closed")} · {r.choice}{r.decidedAt ? ` · ${fmt(r.decidedAt.slice(0, 10))}` : ""}</span>
                  </span>
                  <Link href={`/today/${r.id}` as never} className="font-semibold underline-offset-4 hover:underline">
                    {displayDecisionId(r.id)} {fwd}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("עדיין לא נוצרו החלטות מהיוזמה הזו.", "No decisions have come from this initiative yet.")}</p>
          )}
          {initiative.decisionHooks.length ? (
            <p className="text-xs text-muted-foreground">
              {t("נקודות החלטה בתוכנית", "Decision points in the plan")}: {initiative.decisionHooks.map((h) => `${h.question[locale]} (${fmt(h.windowStart)} – ${fmt(h.windowEnd)})`).join(" · ")}
            </p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
