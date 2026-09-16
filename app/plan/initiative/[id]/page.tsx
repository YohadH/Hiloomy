// /plan/initiative/[id] — one commercial initiative.
//   Before setup: "צריך ממך דקה" — the numbered questions and nothing else.
//   After setup, FOUR blocks first (owner, 16 Sep 2026):
//     1. What Hiloomy thinks happened   2. The campaign probably linked
//     3. What we meant to sell vs what people bought   4. What to do
//   Everything else — the reality numbers, the diagnosis dimensions, the
//   alternatives, the mapping audit — sits under "ראיות ונימוקים".

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { InitiativeRealityPanel } from "@/components/plan/initiative-reality-panel";
import { ContextResolution } from "@/components/plan/context-resolution";
import { EntityLinkButton } from "@/components/plan/entity-link-controls";
import { DiagnosisBlock, RecommendationBlock, AlternativesBlock, QuestionsBlock, IntentBlock } from "@/components/plan/decision-brief";
import { IntentForm } from "@/components/plan/intent-form";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildPlanView, currentPlanSheetId } from "@/lib/services/plan-service";
import { buildInitiativeBrief, loadRealityInputs } from "@/lib/services/initiative-reality-service";
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
  const activeHook = initiative.decisionHooks.find((h) => h.windowStart <= now.toISOString().slice(0, 10) && h.windowEnd >= now.toISOString().slice(0, 10)) ?? null;
  const brief = await buildInitiativeBrief(storeId, initiative, inputs, now, activeHook?.question ?? null);
  const { reality, summary } = brief;
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" });
  const setupMode = reality.status === "needs_context";
  const toConfirm = reality.context.rows.filter((r) => r.action === "confirm");
  const bulk = reality.mappings.hygiene.bulk;
  // One option per title: the same product can sit twice in the catalogue.
  const intentProducts = (() => {
    const byTitle = new Map<string, { ids: string[]; title: string; role: "product" | "gift" }>();
    for (const l of reality.mappings.links) {
      if (!(l.kind === "product" || l.kind === "gift_product") || l.state === "suggested" || l.id === "__none__") continue;
      const role = l.kind === "gift_product" ? ("gift" as const) : ("product" as const);
      const key = `${role}|${l.label.trim().toLowerCase().replace(/\s+/g, " ")}`;
      const cur = byTitle.get(key) ?? { ids: [], title: l.label, role };
      if (!cur.ids.includes(l.id)) cur.ids.push(l.id);
      byTitle.set(key, cur);
    }
    return [...byTitle.values()];
  })();
  const confirmedCampaigns = reality.mappings.links.filter((l) => l.kind === "meta_campaign" && l.state === "confirmed" && l.id !== "__none__");
  const res = reality.mappings.campaignResolution ?? null;
  const resolverRows = [...(res?.likely ? [{ c: res.likely, likely: true }] : []), ...(res?.alternatives ?? []).map((c) => ({ c, likely: false }))];

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-8">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href={"/marketing-planner" as never} className="underline-offset-4 hover:underline">
              {t("התוכנית המסחרית", "Commercial plan")} {fwd}
            </Link>
            <Link href={`/plan/initiative?sheet=${sheetId}` as never} className="underline-offset-4 hover:underline">
              {t("כל היוזמות", "All initiatives")} {fwd}
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{initiative.title}</h1>
          <p className="text-sm text-muted-foreground">
            {fmt(initiative.start)} – {fmt(initiative.end)} · {INITIATIVE_STATUS_LABEL[initiative.status][locale]}
            {initiative.offer.couponCode ? ` · ${initiative.offer.couponCode}` : ""}
          </p>
        </div>

        {setupMode ? (
          /* Mode A — only the setup. Nothing is concluded yet. */
          <section id="context" className="space-y-3">
            <ContextResolution sheetId={sheetId} initiativeId={initiative.id} initiativeTitle={initiative.title} context={reality.context} links={reality.mappings.links} discovery={reality.mappings.discovery} hygiene={reality.mappings.hygiene} locale={locale} compact={false} />
          </section>
        ) : (
          /* Mode B — four blocks, then the evidence. */
          <>
            {!toConfirm.length && bulk.length ? (
              <section id="context" className="space-y-2 rounded-md border border-danger/40 bg-danger/5 p-4 text-sm">
                {bulk.map((b) => (
                  <div key={b.kind} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{t(`${b.count} ${MAPPING_KIND_LABEL[b.kind].he} אושרו בבת אחת מכלל המילה "${b.via}" — לא בשימוש במספרים.`, `${b.count} ${MAPPING_KIND_LABEL[b.kind].en} were confirmed in one batch from the "${b.via}" word rule — not used in the numbers.`)}</span>
                    <EntityLinkButton sheetId={sheetId} initiativeId={initiative.id} kind={b.kind} id="*" label="*" mode="unlink_bulk" text={t(`נקה את ${b.count} המיפויים`, `Clear the ${b.count} mappings`)} />
                  </div>
                ))}
              </section>
            ) : null}
            {toConfirm.length ? (
              <section id="context" className="space-y-3">
                <ContextResolution sheetId={sheetId} initiativeId={initiative.id} initiativeTitle={initiative.title} context={reality.context} links={reality.mappings.links} discovery={reality.mappings.discovery} hygiene={reality.mappings.hygiene} locale={locale} compact />
              </section>
            ) : null}

            {/* 1. What Hiloomy thinks happened */}
            <section id="happened" className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">{t("מה הילומי חושבת שקרה", "What Hiloomy thinks happened")}</h2>
              {brief.diagnosis ? (
                <p className="text-lg font-semibold leading-snug">{brief.diagnosis.headline[locale]}</p>
              ) : (
                <p className="text-lg font-semibold leading-snug">{reality.statusReason[locale]}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {reality.lines.map((l) => `${l.label[locale]}: ${l.text[locale]}`).join(" · ")}
                {reality.goal.defined ? ` · ${reality.goal.note[locale]}` : ""}
              </p>
            </section>

            {/* 2. The campaign probably linked */}
            <section id="campaign" className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">{t("הקמפיין שקשור ליוזמה", "The campaign behind the initiative")}</h2>
              {confirmedCampaigns.length ? (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-semibold">{confirmedCampaigns.map((c) => c.label).join(" · ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("מאושר על ידי המנהל", "Confirmed by the manager")}{brief.diagnosis ? ` · ${brief.diagnosis.paid.evidence[locale]}` : ""}</p>
                </div>
              ) : resolverRows.length ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {res?.likely
                      ? t("Hiloomy דירגה את הקמפיינים לפי שם, תקופה, הוצאה, דף נחיתה וטקסט המודעות. אישור מקשר את ההוצאה וה-ROAS ליוזמה.", "Hiloomy ranked the campaigns by name, period, spend, landing page and ad copy. Confirming links the spend and ROAS to the initiative.")
                      : t(`אף קמפיין לא בולט מספיק כדי לומר שהוא מנוע הביקוש (נבדקו ${res?.total ?? 0}). המועמדים, לפי הסבירות:`, `No campaign stands out enough to call it the demand engine (${res?.total ?? 0} checked). The candidates, by likelihood:`)}
                  </p>
                  <ul className="space-y-2">
                    {resolverRows.map(({ c, likely }) => (
                      <li key={c.id} className={cn("rounded-lg border p-3 text-sm", likely ? "border-foreground/40 bg-muted/30" : "border-border")}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">
                            <span className="me-2 tabular-nums">{Math.round(c.score * 100)}%</span>
                            {c.name}
                            {likely ? <span className="ms-2 rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">{t("סביר", "likely")}</span> : null}
                          </p>
                          <EntityLinkButton sheetId={sheetId} initiativeId={initiative.id} kind="meta_campaign" id={c.id} label={c.name} mode="link" via="campaign_resolver" text={t("זה הקמפיין — אשר", "This is the campaign — confirm")} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{c.reasons.map((r) => r[locale]).join(" · ")}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">{t("בלי קמפיין מאושר, יעילות Meta נשארת 'לא ידוע' — והמלצות לא מזיזות קמפיין שלא הוכח שהוא מנוע הביקוש.", "Without a confirmed campaign, Meta effectiveness stays 'unknown' — and no recommendation moves a campaign that was not shown to drive the demand.")}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("לא נמצא קמפיין Meta שמזכיר את היוזמה בשם, בדף הנחיתה או בטקסט המודעות. אפשר לקשר ידנית בהשלמת ההקשר.", "No Meta campaign names the initiative in its name, landing page or ad copy. It can be linked by hand in the context step.")}</p>
              )}
            </section>

            {/* 3. What we meant to sell vs what people bought */}
            <section id="intent" className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">{t("מה רצינו למכור — ומה אנשים קנו", "What we meant to sell — and what people bought")}</h2>
              {brief.intent && brief.fulfillment ? (
                <IntentBlock intent={brief.intent} f={brief.fulfillment} locale={locale} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("הכוונה המסחרית של היוזמה (מוצר/סט, ערוץ, קהל, יעד) לא הוגדרה. בלי כוונה, Hiloomy מודדת מכירות — לא הצלחה.", "The initiative's commercial intent (product/set, channel, audience, goal) is not set. Without it, Hiloomy measures sales — not success.")}</p>
              )}
              <IntentForm sheetId={sheetId} initiativeId={initiative.id} products={intentProducts} intent={brief.intent} locale={locale} compact={!!brief.intent} />
            </section>

            {/* 4. What to do */}
            {brief.diagnosis && brief.recommendation ? (
              <section id="recommendation" className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">{activeHook ? activeHook.question[locale] : t("מה לעשות", "What to do")}</h2>
                <RecommendationBlock rec={brief.recommendation} locale={locale} />
                {brief.recommendation.questions.length ? (
                  <div className="space-y-2">
                    <h3 className="font-semibold">{t("שאלה שמשנה את ההמלצה", "A question that changes the recommendation")}</h3>
                    <QuestionsBlock rec={brief.recommendation} locale={locale} sheetId={sheetId} initiativeId={initiative.id} coverDays={summary.inventory.worst?.coverDays ?? null} />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <h3 className="font-semibold">{t("מה ישנה את ההמלצה", "What would change this")}</h3>
                  <ul className="space-y-1 text-sm">
                    {brief.recommendation.wouldChange.map((w, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                        <span>{w[locale]}</span>
                      </li>
                    ))}
                  </ul>
                  {initiative.relatedDecisions.length ? null : (
                    <p className="text-xs text-muted-foreground">{t("ההמלצה כאן היא ניתוח של היוזמה. היא נפתחת ב'היום' רק כשחלון החלטה מגיע או כשממצא עובר את סף הדירוג.", "This is the initiative's analysis. It opens on Today only when a decision window arrives or a finding passes the ranking threshold.")}</p>
                  )}
                </div>
              </section>
            ) : null}

            {/* Evidence & reasoning — everything the four blocks rest on */}
            <details id="evidence" className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer select-none text-base font-semibold">{t("ראיות ונימוקים", "Evidence & reasoning")}</summary>
              <div className="mt-4 space-y-8">
                <section className="space-y-3">
                  <h3 className="font-semibold">{t("מצב היוזמה — המספרים", "Initiative reality — the numbers")}</h3>
                  <InitiativeRealityPanel r={summary} locale={locale} now={now} showPlan />
                </section>
                {brief.diagnosis ? (
                  <section className="space-y-3">
                    <h3 className="font-semibold">{t("אבחון עסקי — ממד אחר ממד", "Business diagnosis — dimension by dimension")}</h3>
                    <p className="text-sm text-muted-foreground">{t("בעיית ערוץ או בעיית עסק? כל ממד לפי הראיות של היוזמה הזו בלבד.", "A channel problem or a business problem? Each dimension from this initiative's evidence only.")}</p>
                    <DiagnosisBlock d={brief.diagnosis} locale={locale} />
                  </section>
                ) : null}
                {brief.recommendation && brief.recommendation.alternatives.length ? (
                  <section className="space-y-3">
                    <h3 className="font-semibold">{t("מרחב ההחלטה — החלופות ומתי כל אחת עדיפה", "Decision space — the alternatives and when each is better")}</h3>
                    <AlternativesBlock rec={brief.recommendation} locale={locale} />
                  </section>
                ) : null}
              </div>
            </details>
          </>
        )}

        {/* Details / Audit — for whoever needs to know why */}
        <details id="audit" className="text-sm">
          <summary className="cursor-pointer select-none font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("פרטים / ביקורת: מה התוכנית אומרת, המיפוי וכלליו, ההחלטות של היוזמה", "Details / audit: the plan's words, the mapping and its rules, this initiative's decisions")}</summary>
          <div className="mt-4 space-y-6">
            <section className="space-y-1">
              <h3 className="font-semibold">{t("מה התוכנית אומרת", "What the plan says")}</h3>
              <ul className="space-y-1">
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
              <p className="text-xs text-muted-foreground">
                {t("סוג היוזמה (מזוהה)", "Initiative kind (inferred)")}: {reality.context.initiativeKind} · {t("יעד", "Goal")}: {summary.goalNote[locale]}
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">{t("המיפוי וכלליו", "The mapping and its rules")}</h3>
              <p className="text-xs text-muted-foreground">{t("מאושר = ראיה מלאה. זוהה אוטומטית = שם מוצר מדויק, קמפיין מקושר למוצר, או קמפיין שכמה סימנים מצביעים עליו — משמש כאומדן. הצעה = התאמת מילה או ציון נמוך, לא משמשת.", "Confirmed = full evidence. Auto-matched = exact product title, a campaign linked to the product, or a campaign several signals point at — used as an estimate. Suggested = a word match or a low score, never used.")}</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {KINDS.map((kind) => {
                  const links = reality.mappings.links.filter((l) => l.kind === kind);
                  const k = reality.mappings.byKind[kind];
                  const disc = reality.mappings.discovery[kind];
                  return (
                    <div key={kind} className="space-y-1.5 rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{MAPPING_KIND_LABEL[kind][locale]}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs", k.state === "confirmed" ? "bg-success/15 text-success" : k.state === "provisional" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{k.detail[locale]}</span>
                      </div>
                      {disc?.note ? <p className="text-xs text-warning">{disc.note[locale]}</p> : null}
                      <ul className="space-y-1 text-xs">
                        {links.map((l) => (
                          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <span className="font-medium">{l.label}</span> · {BASIS_LABEL[l.state][locale]} · {t("כלל", "rule")}: {l.provenance.rule}
                              {l.provenance.auto ? ` (${t("במקור", "originally")} ${l.provenance.auto})` : ""} · {t("התאמה על", "matched on")}: {l.provenance.matchedOn}
                            </span>
                            {l.state === "confirmed" ? <EntityLinkButton sheetId={sheetId} initiativeId={initiative.id} kind={kind} id={l.id} label={l.label} mode="unlink" text={t("הסר", "Remove")} /> : null}
                          </li>
                        ))}
                      </ul>
                      {links.some((l) => l.state === "confirmed") ? <EntityLinkButton sheetId={sheetId} initiativeId={initiative.id} kind={kind} id="*" label="*" mode="unlink_kind" text={t("נקה את כל המיפוי של הסוג הזה", "Clear every mapping of this kind")} /> : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-1">
              <h3 className="font-semibold">{t("החלטות של היוזמה", "This initiative's decisions")}</h3>
              {initiative.relatedDecisions.length ? (
                <ul className="divide-y divide-border">
                  {initiative.relatedDecisions.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium">{r.question[locale]}</span>
                        <span className="text-xs text-muted-foreground"> · {r.state === "open" ? t("פתוחה", "open") : t("נסגרה", "closed")} · {r.choice}</span>
                      </span>
                      <Link href={`/today/${r.id}` as never} className="font-semibold underline-offset-4 hover:underline">
                        {displayDecisionId(r.id)} {fwd}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">{t("עדיין לא נוצרו החלטות מהיוזמה הזו.", "No decisions have come from this initiative yet.")}</p>
              )}
              {initiative.decisionHooks.length ? <p className="text-xs text-muted-foreground">{t("נקודות החלטה בתוכנית", "Decision points in the plan")}: {initiative.decisionHooks.map((h) => `${h.question[locale]} (${fmt(h.windowStart)} – ${fmt(h.windowEnd)})`).join(" · ")}</p> : null}
            </section>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
