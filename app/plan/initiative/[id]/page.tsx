// /plan/initiative/[id] — one commercial initiative, CONCLUSION FIRST.
//
// Product principle (owner, 2026-09-15): a manager understands the state of
// an initiative in ten seconds —
//   HERO      the status, the result, the one-line conclusion
//   WHAT'S HAPPENING  the funnel and where it breaks
//   RECOMMENDATION    campaign lane apart from initiative lane, confidence split
//   WHAT COULD MAKE THIS WRONG  the few real caveats
// Evidence is progressive disclosure; mapping/debug is a separate surface.
// A decision lives only in Today — this page links to it, never duplicates it.
//   Before setup: "צריך ממך דקה" — the numbered questions and nothing else.
<<<<<<< HEAD
//   After setup, FOUR blocks first (owner, 16 Sep 2026):
//     1. What Hiloomy thinks happened   2. The campaign probably linked
//     3. What we meant to sell vs what people bought   4. What to do
//   Everything else — the reality numbers, the diagnosis dimensions, the
//   alternatives, the mapping audit — sits under "ראיות ונימוקים".
=======
>>>>>>> 9ecd84c8c07b691719231bde1c8403c570181a35

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { InitiativeRealityPanel } from "@/components/plan/initiative-reality-panel";
import { InitiativeFunnel } from "@/components/plan/initiative-funnel";
import { ContextResolution } from "@/components/plan/context-resolution";
import { EntityLinkButton } from "@/components/plan/entity-link-controls";
<<<<<<< HEAD
import { DiagnosisBlock, RecommendationBlock, AlternativesBlock, QuestionsBlock, IntentBlock } from "@/components/plan/decision-brief";
import { IntentForm } from "@/components/plan/intent-form";
=======
import { DiagnosisBlock, AlternativesBlock, QuestionsBlock } from "@/components/plan/decision-brief";
>>>>>>> 9ecd84c8c07b691719231bde1c8403c570181a35
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

const CONF: Record<"high" | "medium" | "low", { he: string; en: string; cls: string }> = {
  high: { he: "גבוה", en: "high", cls: "text-success" },
  medium: { he: "בינוני", en: "medium", cls: "text-warning" },
  low: { he: "נמוך", en: "low", cls: "text-danger" }
};

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

  const funnel = brief.diagnosis?.funnel ?? null;
  const rec = brief.recommendation;
  const openDecision = initiative.relatedDecisions.find((r) => r.state === "open") ?? null;
  const live = summary.period.start <= summary.period.today && summary.period.end >= summary.period.today;
  const m = (k: string) => summary.metrics.find((x) => x.key === k) ?? null;
  const risky = summary.findings.some((f) => f.severity === "risk");
  const funnelDefinitive = !!funnel && (funnel.verdict === "attribution_mismatch" || funnel.verdict === "measurement_suspected" || funnel.purchaseDemand === "no_observed_purchase_demand");
  const chip = setupMode
    ? { text: t("דורש השלמה", "Needs context"), cls: "bg-warning/15 text-warning" }
    : funnelDefinitive || risky
      ? { text: t("דרושה פעולה", "Act"), cls: "bg-danger/10 text-danger" }
      : rec?.answer === "insufficient"
        ? { text: t("ממתין לראיות", "Awaiting evidence"), cls: "bg-muted text-muted-foreground" }
        : { text: t("ללא ממצא חריג", "No issue detected"), cls: "bg-success/15 text-success" };
  const conclusion = brief.diagnosis?.headline ?? summary.statusReason;

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-8">
        {/* ── HERO: status + result + conclusion, first ─────────────────── */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href={"/marketing-planner" as never} className="underline-offset-4 hover:underline">
              {t("התוכנית המסחרית", "Commercial plan")} {fwd}
            </Link>
            <Link href={`/plan/initiative?sheet=${sheetId}` as never} className="underline-offset-4 hover:underline">
              {t("כל היוזמות", "All initiatives")} {fwd}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{initiative.title}</h1>
            <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", chip.cls)}>{chip.text}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {fmt(initiative.start)} – {fmt(initiative.end)} · {INITIATIVE_STATUS_LABEL[initiative.status][locale]}
            {initiative.offer.couponCode ? ` · ${initiative.offer.couponCode}` : ""}
          </p>
          {!setupMode ? (
            <>
              <p className="text-xl font-semibold leading-snug">{conclusion[locale]}</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{live ? summary.period.dayIndex : summary.period.totalDays}</p>
                  <p className="text-sm text-muted-foreground">{live ? t(`ימים באוויר מתוך ${summary.period.totalDays}`, `days live of ${summary.period.totalDays}`) : summary.period.start > summary.period.today ? t("טרם התחיל", "not started") : t("ימים (הסתיים)", "days (ended)")}</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{m("meta_spend")?.value ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">{t("הוצאת מטא", "Meta spend")}</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{funnel ? funnel.metaPurchases : "—"}</p>
                  <p className="text-sm text-muted-foreground">{t("רכישות · ייחוס מטא", "Purchases · Meta attribution")}</p>
                </div>
                <div>
                  <p className={cn("text-2xl font-semibold tabular-nums", funnel?.verdict === "attribution_mismatch" && "text-warning")}>{funnel?.shopifyUnits ?? m("units")?.value ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">{t("יחידות · שופיפיי מאומת", "Units · Shopify confirmed")}</p>
                </div>
              </div>
            </>
          ) : null}
          {openDecision ? (
            <Link href={`/today/${openDecision.id}` as never} className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background">
              {t("החלטה ממתינה בהיום — לבחון אותה", "A decision is waiting in Today — review it")} {fwd} <span className="opacity-70">{displayDecisionId(openDecision.id)}</span>
            </Link>
          ) : null}
        </div>

        {setupMode ? (
          /* Mode A — only the setup. Nothing is concluded yet. */
          <section id="context" className="space-y-3">
            <ContextResolution sheetId={sheetId} initiativeId={initiative.id} initiativeTitle={initiative.title} context={reality.context} links={reality.mappings.links} discovery={reality.mappings.discovery} hygiene={reality.mappings.hygiene} locale={locale} compact={false} />
          </section>
        ) : (
<<<<<<< HEAD
          /* Mode B — four blocks, then the evidence. */
          <>
=======
          <>
            {/* Mapping hygiene warning stays visible — it changes the numbers */}
>>>>>>> 9ecd84c8c07b691719231bde1c8403c570181a35
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

<<<<<<< HEAD
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
=======
            {/* ── WHAT'S HAPPENING — the funnel and where it breaks ──────── */}
            {funnel ? (
              <section id="whats-happening" className="space-y-3">
                <h2 className="text-xl font-semibold tracking-tight">{t("מה קורה כאן?", "What's happening?")}</h2>
                <InitiativeFunnel funnel={funnel} locale={locale} />
              </section>
            ) : null}

            {/* ── RECOMMENDATION — two lanes, confidence split ───────────── */}
            {rec ? (
              <section id="recommendation" className="space-y-3">
                <h2 className="text-xl font-semibold tracking-tight">{activeHook ? activeHook.question[locale] : t("המלצה", "Recommendation")}</h2>
                <div className="space-y-3 rounded-md border border-border p-4">
                  <p className="text-base font-semibold leading-snug">{rec.what[locale]}</p>
                  {rec.paidCampaign ? (
                    <p className="text-sm">
                      <span className="font-medium text-muted-foreground">{t("הקמפיין הממומן", "Paid campaign")}: </span>
                      {rec.paidCampaign.line[locale]}
                    </p>
                  ) : null}
                  {rec.initiativeLine ? (
                    <p className="text-sm">
                      <span className="font-medium text-muted-foreground">{t("היוזמה עצמה", "The initiative itself")}: </span>
                      {rec.initiativeLine[locale]}
                    </p>
                  ) : null}
                  {rec.why.length ? <p className="text-sm text-muted-foreground">{rec.why[0][locale]}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {t("ביטחון בביצועים", "Performance confidence")}: <span className={cn("font-semibold", CONF[rec.performanceConfidence].cls)}>{CONF[rec.performanceConfidence][locale]}</span> — {rec.performanceReason[locale]}
                    <br />
                    {t("ביטחון ברווחיות", "Profit confidence")}: <span className={cn("font-semibold", CONF[rec.profitConfidence].cls)}>{CONF[rec.profitConfidence][locale]}</span> — {rec.profitReason[locale]}
                  </p>
                </div>
                {rec.questions.length ? <QuestionsBlock rec={rec} locale={locale} sheetId={sheetId} initiativeId={initiative.id} coverDays={summary.inventory.worst?.coverDays ?? null} /> : null}
              </section>
            ) : null}

            {/* ── WHAT COULD MAKE THIS WRONG — the few real caveats ─────── */}
            {rec ? (
              <section id="would-change" className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight">{t("מה יכול להפוך את זה?", "What could make this wrong?")}</h2>
                <ul className="space-y-1 text-sm">
                  {rec.wouldChange.slice(0, 4).map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                      <span>{w[locale]}</span>
                    </li>
                  ))}
                </ul>
                {!openDecision ? (
                  <p className="text-xs text-muted-foreground">{t("ההמלצה כאן היא ניתוח של היוזמה. החלטה חיה רק ב'היום' — היא נפתחת שם כשחלון החלטה מגיע או כשממצא עובר את סף הדירוג.", "This is the initiative's analysis. A decision lives only in Today — it opens there when a decision window arrives or a finding passes the ranking threshold.")}</p>
                ) : null}
              </section>
            ) : null}

            {/* ── ORIGINAL PLAN — compact ────────────────────────────────── */}
            <section id="plan" className="space-y-1 rounded-md border border-border p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("התוכנית המקורית", "Original plan")}</p>
              <p className="font-medium">
                {initiative.title} · {fmt(initiative.start)} – {fmt(initiative.end)}
              </p>
              {initiative.decisionHooks.length ? <p className="text-muted-foreground">{t("בדיקה מתוכננת", "Scheduled review")}: {initiative.decisionHooks[0].question[locale]}</p> : null}
              <details>
                <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground underline-offset-4 hover:underline">{t("צפייה בתוכנית המקורית", "View original plan")}</summary>
                <ul className="mt-2 space-y-1">
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
              </details>
            </section>

            {/* ── DATA CONNECTIONS — compact; the technical UI is below ──── */}
            <section id="connections" className="space-y-2 rounded-md border border-border p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("חיבורי דאטה", "Data connections")}</p>
              <p className="text-muted-foreground">{summary.mappings.map((k) => `${MAPPING_KIND_LABEL[k.kind][locale]}: ${k.detail[locale]}`).join(" · ")}</p>
              {summary.missingEvidence.length ? <p className="text-xs text-muted-foreground">{t("חסר", "Missing")}: {summary.missingEvidence.map((x) => x.label[locale]).join(" · ")}</p> : null}
              <a href="#audit" className="text-xs font-semibold underline-offset-4 hover:underline">
                {t("ניהול המיפוי והגדרות הדאטה", "View mapping & data setup")} {fwd}
              </a>
            </section>

            {/* ── FULL EVIDENCE — collapsed by default ───────────────────── */}
            <details id="evidence" className="text-sm">
              <summary className="cursor-pointer select-none font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("ראיות מלאות: כל המדדים, האבחון לפי ממדים, החלופות", "View full evidence: every metric, the dimension diagnosis, the alternatives")}</summary>
              <div className="mt-4 space-y-6">
                <InitiativeRealityPanel r={summary} locale={locale} now={now} showPlan={false} />
                {brief.diagnosis ? (
                  <section className="space-y-2">
                    <h3 className="font-semibold">{t("אבחון לפי ממדים", "Dimension diagnosis")}</h3>
                    <DiagnosisBlock d={brief.diagnosis} locale={locale} />
                  </section>
                ) : null}
                {rec?.alternatives.length ? (
                  <section className="space-y-2">
                    <h3 className="font-semibold">{t("מרחב ההחלטה", "Decision space")}</h3>
                    <AlternativesBlock rec={rec} locale={locale} />
>>>>>>> 9ecd84c8c07b691719231bde1c8403c570181a35
                  </section>
                ) : null}
              </div>
            </details>
          </>
        )}

        {/* Mapping / entity debugging — a separate operational surface */}
        <details id="audit" className="text-sm">
          <summary className="cursor-pointer select-none font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("מיפוי והגדרות דאטה: הכללים, הישויות וההחלטות", "Mapping & data setup: the rules, the entities and this initiative's decisions")}</summary>
          <div className="mt-4 space-y-6">
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
              <p className="text-xs text-muted-foreground">
                {t("סוג היוזמה (מזוהה)", "Initiative kind (inferred)")}: {reality.context.initiativeKind} · {t("יעד", "Goal")}: {summary.goalNote[locale]}
              </p>
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
