import { Swords, Zap, CalendarDays, Bot, FileText, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CompetitorBrief, BriefAction } from "@/lib/services/competitor-brief-service";

// One prescribed action: clean bold imperative on top, then the reasoning
// ("why", with the numbers), the concrete "how", and a measurable target.
function ActionItem({
  item,
  index,
  accent,
  isHe
}: {
  item: BriefAction;
  index: number;
  accent: "indigo" | "muted";
  isHe: boolean;
}) {
  const chip =
    accent === "indigo"
      ? "bg-indigo-600 text-white"
      : "bg-muted text-foreground";
  return (
    <li className="flex items-start gap-2 text-sm leading-6">
      <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${chip}`}>
        {index + 1}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{item.action}</p>
        {item.why ? (
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            <span className="font-semibold">{isHe ? "למה: " : "Why: "}</span>
            {item.why}
          </p>
        ) : null}
        {item.how ? (
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            <span className="font-semibold">{isHe ? "איך: " : "How: "}</span>
            {item.how}
          </p>
        ) : null}
        {item.target ? (
          <p className="mt-0.5 flex items-start gap-1 text-[13px] leading-5 text-emerald-700">
            <Target className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">{isHe ? "יעד: " : "Target: "}</span>
              {item.target}
            </span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

// Command Center "מתחרים" section — what competitors are doing right now and
// what to do about it (today / this week). Advice comes from the BI agent
// when reachable, otherwise from the intel snapshot's pre-written actions;
// the source chip tells the founder which one they're reading.

const TIER_LABEL: Record<string, { he: string; en: string; cls: string }> = {
  "luxury-import": { he: "יוקרה מיובאת", en: "Luxury import", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  "mid-niche": { he: "ביניים", en: "Mid niche", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  "budget-dupe": { he: "חיקויי בשמים", en: "Budget dupes", cls: "bg-rose-50 text-rose-800 border-rose-300" }
};

export function CompetitorBriefSection({
  brief,
  isHe
}: {
  brief: CompetitorBrief;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);

  return (
    <div className="space-y-3">
      {/* Competitor moves */}
      <div className="grid gap-3 sm:grid-cols-2">
        {brief.competitors.map((c) => {
          const tier = TIER_LABEL[c.tier] ?? TIER_LABEL["mid-niche"];
          return (
            <Card key={c.name}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{c.name}</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tier.cls}`}>
                    {isHe ? tier.he : tier.en}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground">{c.move}</p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{c.implication}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Prescriptions: today / this week */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-indigo-900">
              <Zap className="h-4 w-4" aria-hidden />
              {lang("לעשות באתר היום", "Do on the site today")}
            </p>
            <ul className="mt-2 space-y-3">
              {brief.today.map((item, i) => (
                <ActionItem key={i} item={item} index={i} accent="indigo" isHe={isHe} />
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden />
              {lang("השבוע", "This week")}
            </p>
            <ul className="mt-2 space-y-3">
              {brief.thisWeek.map((item, i) => (
                <ActionItem key={i} item={item} index={i} accent="muted" isHe={isHe} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {brief.source === "bi-agent" ? (
          <>
            <Bot className="h-3.5 w-3.5" aria-hidden />
            {lang(
              `ניתוח BI על בסיס סקירת מודיעין מ${brief.generatedAt}.`,
              `BI analysis based on the ${brief.generatedAt} intel sweep.`
            )}
          </>
        ) : (
          <>
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {lang(
              `מתוך סיכום המודיעין מ${brief.generatedAt} (סוכן הBI לא זמין כרגע).`,
              `From the ${brief.generatedAt} intel summary (BI agent currently unavailable).`
            )}
          </>
        )}
        <Swords className="h-3.5 w-3.5" aria-hidden />
      </p>
    </div>
  );
}
