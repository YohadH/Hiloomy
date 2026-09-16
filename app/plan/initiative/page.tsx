// /plan/initiative — every live / upcoming initiative of the current plan
// with its reality status. Doubles as the compact "Needs context" queue:
// initiatives whose evaluation is blocked on a mapping come first, with the
// number of connections to complete. Setup, not decisions — Today is untouched.

import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildPlanView, currentPlanSheetId } from "@/lib/services/plan-service";
import { buildPlanRealities } from "@/lib/services/initiative-reality-service";
import { MAPPING_KIND_LABEL, type InitiativeReality, type InitiativeRealityStatus } from "@/lib/domain/initiative-reality";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS: Record<InitiativeRealityStatus, { he: string; en: string; cls: string; order: number }> = {
  needs_context: { he: "נבדק · ממתין לנתונים", en: "Checked · awaiting data", cls: "bg-muted text-muted-foreground", order: 2 },
  needs_attention: { he: "דורש תשומת לב", en: "Needs attention", cls: "bg-warning/15 text-warning", order: 1 },
  insufficient_data: { he: "אין מספיק מידע", en: "Insufficient data", cls: "bg-muted text-muted-foreground", order: 3 },
  off_track: { he: "מחוץ למסלול", en: "Off track", cls: "bg-danger/10 text-danger", order: 3 },
  no_issue_detected: { he: "לא נמצאה בעיה", en: "No issue detected", cls: "bg-success/15 text-success", order: 4 },
  on_track: { he: "במסלול", en: "On track", cls: "bg-success/15 text-success", order: 5 }
};

export default async function InitiativesIndex({ searchParams }: { searchParams: Promise<{ sheet?: string }> }) {
  const locale = (await getAppLocale()) as "he" | "en";
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const fwd = isHe ? "←" : "→";
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const { sheet } = await searchParams;
  const now = new Date();
  const sheetId = sheet ?? (await currentPlanSheetId(storeId, now));
  const [chrome, plan] = await Promise.all([getAppChromeData(), sheetId ? buildPlanView(storeId, sheetId, now).catch(() => null) : Promise.resolve(null)]);
  const realities: Map<string, InitiativeReality> = plan ? await buildPlanRealities(storeId, plan, now) : new Map<string, InitiativeReality>();
  const rows = plan
    ? plan.initiatives
        .filter((i) => i.kind === "move" && i.status !== "completed")
        .map((i) => ({ i, r: realities.get(i.id) ?? null }))
        .sort((a, b) => (a.r ? STATUS[a.r.status].order : 9) - (b.r ? STATUS[b.r.status].order : 9) || a.i.start.localeCompare(b.i.start))
    : [];
  const needs = rows.filter((x) => x.r?.status === "needs_context");
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-8">
        <div>
          <p className="text-sm text-muted-foreground">{t("התוכנית המסחרית", "Commercial plan")}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{t("מצב היוזמות", "Initiative reality")}</h1>
          {plan ? <p className="text-sm text-muted-foreground">{plan.title}</p> : <p className="text-sm text-muted-foreground">{t("אין תוכנית שמכסה את היום.", "No plan covers today.")}</p>}
        </div>

        {needs.length ? (
          <section className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-4">
            <p className="text-base font-semibold">{t(`${needs.length} יוזמות נבדקו — ממתינות לנתונים או לתשובה אחת`, `${needs.length} initiative${needs.length === 1 ? "" : "s"} checked — awaiting data or one answer`)}</p>
            <p className="text-sm text-muted-foreground">{t("חיבורים חסרים חוסמים את ההערכה. זו הגדרה קצרה, לא החלטה.", "Missing connections block the evaluation. A short setup, not a decision.")}</p>
            <ul className="divide-y divide-border/60 text-sm">
              {needs.map(({ i, r }) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{i.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {" · "}
                      {t(`${r!.context.required} חיבורים נדרשים`, `${r!.context.required} mapping${r!.context.required === 1 ? "" : "s"} required`)}: {r!.context.missingCritical.map((k) => MAPPING_KIND_LABEL[k][locale]).join(", ")}
                    </span>
                  </span>
                  <Link href={`/plan/initiative/${i.id}?sheet=${plan!.sheetId}#context` as never} className="rounded-md border border-foreground px-3 py-1 text-xs font-semibold hover:bg-foreground hover:text-background">
                    {t("השלם", "Resolve")} {fwd}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ul className="divide-y divide-border">
          {rows.map(({ i, r }) => {
            const st = r ? STATUS[r.status] : null;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  <Link href={`/plan/initiative/${i.id}?sheet=${plan!.sheetId}` as never} className="font-medium underline-offset-4 hover:underline">
                    {i.title}
                  </Link>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {" · "}
                    {fmt(i.start)} – {fmt(i.end)}
                  </span>
                  {r ? <span className="block text-xs text-muted-foreground">{r.statusReason[locale]}</span> : null}
                </span>
                {st ? <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", st.cls)}>{isHe ? st.he : st.en}</span> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
