// /plan — the commercial month. What the brand intends to do in the next ~30
// days and where each initiative stands: active, upcoming, commercial
// events, needs context, needs attention, decisions due this week. Links
// only — setup and reasoning live on the initiative page; the Gantt stays
// at /marketing-planner.

import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildPlanView, currentPlanSheetId } from "@/lib/services/plan-service";
import { buildPlanRealities } from "@/lib/services/initiative-reality-service";
import { composeCommercialContext, loadConfirmedLinks } from "@/lib/services/commercial-calendar-service";
import { MAPPING_KIND_LABEL, type InitiativeReality } from "@/lib/domain/initiative-reality";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS: Record<InitiativeReality["status"], { he: string; en: string; cls: string }> = {
  needs_context: { he: "נבדק · ממתין לנתונים", en: "Checked · awaiting data", cls: "bg-muted text-muted-foreground" },
  needs_attention: { he: "דורש תשומת לב", en: "Needs attention", cls: "bg-warning/15 text-warning" },
  insufficient_data: { he: "אין מספיק מידע", en: "Insufficient data", cls: "bg-muted text-muted-foreground" },
  off_track: { he: "מחוץ למסלול", en: "Off track", cls: "bg-danger/10 text-danger" },
  no_issue_detected: { he: "לא נמצאה בעיה", en: "No issue detected", cls: "bg-success/15 text-success" },
  on_track: { he: "במסלול", en: "On track", cls: "bg-success/15 text-success" }
};

export default async function PlanMonthPage({ searchParams }: { searchParams: Promise<{ sheet?: string }> }) {
  const locale = (await getAppLocale()) as "he" | "en";
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const fwd = isHe ? "←" : "→";
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const { sheet } = await searchParams;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const sheetId = sheet ?? (await currentPlanSheetId(storeId, now));
  const [chrome, plan] = await Promise.all([getAppChromeData(), sheetId ? buildPlanView(storeId, sheetId, now).catch(() => null) : Promise.resolve(null)]);
  const realities: Map<string, InitiativeReality> = plan ? await buildPlanRealities(storeId, plan, now) : new Map<string, InitiativeReality>();
  const links = plan ? await loadConfirmedLinks(plan.sheetId).catch(() => new Map<string, string>()) : new Map<string, string>();
  const calendar = composeCommercialContext(plan, links, now);
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  const in7 = (iso: string) => iso >= today && (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000 <= 7;

  const moves = plan ? plan.initiatives.filter((i) => i.kind === "move") : [];
  const active = moves.filter((i) => i.start <= today && i.end >= today);
  const upcoming = moves.filter((i) => i.start > today && (Date.parse(`${i.start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000 <= 30);
  const needsContext = active.filter((i) => realities.get(i.id)?.status === "needs_context");
  const needsAttention = active.filter((i) => realities.get(i.id)?.status === "needs_attention");
  const dueThisWeek = moves.flatMap((i) => i.decisionHooks.filter((h) => in7(h.windowEnd) || (h.windowStart <= today && h.windowEnd >= today)).map((h) => ({ i, h })));

  const Row = ({ i }: { i: (typeof moves)[number] }) => {
    const r = realities.get(i.id) ?? null;
    const st = r ? STATUS[r.status] : null;
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
        <span className="min-w-0">
          <Link href={`/plan/initiative/${i.id}?sheet=${plan!.sheetId}` as never} className="font-medium underline-offset-4 hover:underline">
            {i.title}
          </Link>
          <span className="text-xs text-muted-foreground tabular-nums">
            {" · "}
            {fmt(i.start)} – {fmt(i.end)}
            {i.offer.couponCode ? ` · ${i.offer.couponCode}` : ""}
          </span>
          {r && r.status === "needs_context" ? <span className="block text-xs text-muted-foreground">{r.context.question ? t("שאלה אחת ממתינה", "One question waiting") : (r.context.launch.insight?.[locale] ?? `${t("נבדק — טרם זוהו", "checked — not detected yet")}: ${r.context.missingCritical.map((k) => MAPPING_KIND_LABEL[k][locale]).join(", ")}`)}</span> : null}
          {r && r.status === "needs_attention" ? <span className="block text-xs text-warning">{r.statusReason[locale]}</span> : null}
        </span>
        {st ? <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", st.cls)}>{isHe ? st.he : st.en}</span> : null}
      </li>
    );
  };

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-10">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{plan?.title ?? t("אין תוכנית", "No plan")}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{t("החודש המסחרי", "The commercial month")}</h1>
          {plan ? (
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <li>
                <b className="tabular-nums">{active.length}</b> {t("יוזמות פעילות", "initiatives active")}
              </li>
              <li>
                <b className="tabular-nums">{upcoming.length}</b> {t("קרובות", "upcoming")}
              </li>
              <li className={needsContext.length ? "text-warning" : ""}>
                <b className="tabular-nums">{needsContext.length}</b> {t("צריכות השלמה", "need context")}
              </li>
              <li className={needsAttention.length ? "text-warning" : ""}>
                <b className="tabular-nums">{needsAttention.length}</b> {t("דורשות תשומת לב", "need attention")}
              </li>
              <li>
                <b className="tabular-nums">{dueThisWeek.length}</b> {t("החלטות השבוע", "decisions due this week")}
              </li>
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("ייבאו את הגאנט של החודש כדי שהילומי תבין את הכיוון המסחרי.", "Import this month's Gantt so Hiloomy understands the commercial direction.")}{" "}
              <Link href={"/marketing-planner" as never} className="underline-offset-4 hover:underline">
                {t("לתוכנית", "Go to the plan")} {fwd}
              </Link>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            <Link href={"/marketing-planner" as never} className="underline-offset-4 hover:underline">
              {t("הגאנט המלא", "The full Gantt")} {fwd}
            </Link>
          </p>
        </div>

        {needsAttention.length ? (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{t("דורש תשומת לב", "Needs attention")}</h2>
            <ul className="divide-y divide-border">{needsAttention.map((i) => <Row key={i.id} i={i} />)}</ul>
          </section>
        ) : null}

        {needsContext.length ? (
          <section className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-4">
            <h2 className="text-xl font-semibold tracking-tight">{t("צריך השלמה", "Needs context")}</h2>
            <p className="text-sm text-muted-foreground">{t("חיבורים חסרים חוסמים את ההערכה. דקה לכל יוזמה.", "Missing connections block the evaluation. A minute per initiative.")}</p>
            <ul className="divide-y divide-border/60">
              {needsContext.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{i.title}</span>
                    <span className="text-xs text-muted-foreground"> · {t("חסר", "missing")}: {realities.get(i.id)!.context.missingCritical.map((k) => MAPPING_KIND_LABEL[k][locale]).join(", ")}</span>
                  </span>
                  <Link href={`/plan/initiative/${i.id}?sheet=${plan!.sheetId}#context` as never} className="rounded-md border border-foreground px-3 py-1 text-xs font-semibold hover:bg-foreground hover:text-background">
                    {t("השלם", "Resolve")} {fwd}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {dueThisWeek.length ? (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{t("החלטות השבוע", "Decisions due this week")}</h2>
            <ul className="divide-y divide-border text-sm">
              {dueThisWeek.map(({ i, h }) => {
                const open = i.relatedDecisions.find((r) => r.hookId === h.id);
                return (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{h.question[locale]}</span>
                      <span className="text-xs text-muted-foreground"> · {i.title} · {fmt(h.windowStart)} – {fmt(h.windowEnd)}</span>
                    </span>
                    {open ? (
                      <Link href={`/today/${open.id}` as never} className="text-xs font-semibold underline-offset-4 hover:underline">
                        {open.state === "open" ? t("פתוחה בהיום", "Open on Today") : t("נסגרה", "Closed")} {fwd}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("תיפתח כשהחלון מגיע", "Opens when the window arrives")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{t("יוזמות פעילות", "Active initiatives")}</h2>
            {active.length ? <ul className="divide-y divide-border">{active.map((i) => <Row key={i.id} i={i} />)}</ul> : <p className="text-sm text-muted-foreground">{t("אין יוזמה פעילה היום.", "No initiative is active today.")}</p>}
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{t("יוזמות קרובות", "Upcoming initiatives")}</h2>
            {upcoming.length ? <ul className="divide-y divide-border">{upcoming.map((i) => <Row key={i.id} i={i} />)}</ul> : <p className="text-sm text-muted-foreground">{t("אין יוזמה שמתחילה ב-30 הימים הקרובים.", "No initiative starts in the next 30 days.")}</p>}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{t("אירועים מסחריים", "Commercial events")}</h2>
          {calendar.events.length ? (
            <ul className="divide-y divide-border text-sm">
              {calendar.events.slice(0, 4).map((ev) => (
                <li key={ev.calendarEvent.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{ev.calendarEvent.name[locale]}</span>
                    <span className="text-xs text-muted-foreground tabular-nums"> · {ev.dateRange[locale]} · {ev.calendarEvent.sourceLabel[locale]}</span>
                    {ev.linkedInitiatives.length ? <span className="block text-xs text-muted-foreground">↳ {ev.linkedInitiatives.map((l) => `${l.title}${l.linkState === "suggested" ? ` (${t("קישור מוצע", "suggested link")})` : ""}`).join(" · ")}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{ev.timeLabel[locale]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("אין אירוע ב-30 הימים הקרובים.", "No event in the next 30 days.")}</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
