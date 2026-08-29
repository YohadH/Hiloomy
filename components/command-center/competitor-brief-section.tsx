import { Card, CardContent } from "@/components/ui/card";
import type { CompetitorBrief } from "@/lib/services/competitor-brief-service";
import { CompetitorBriefActionsBlock } from "@/components/command-center/competitor-brief-actions";

// Command Center "מתחרים" section — what competitors are doing right now and
// what to do about it (today / this week). Advice comes from the BI agent
// when reachable, otherwise from the intel snapshot's pre-written actions;
// the source chip tells the founder which one they're reading.

const TIER_LABEL: Record<string, { he: string; en: string; cls: string }> = {
  "luxury-import": { he: "יוקרה מיובאת", en: "Luxury import", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  "mid-niche": { he: "ביניים", en: "Mid niche", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  "budget-dupe": { he: "חיקויי בשמים", en: "Budget dupes", cls: "bg-rose-50 text-rose-800 border-rose-300" },
  tracked: { he: "במעקב", en: "Tracked", cls: "bg-emerald-50 text-emerald-800 border-emerald-300" }
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
          // The move line arrives "·"-joined; one long run-on line is
          // unreadable — each observation gets its own bullet.
          const moveParts = c.move.split(" · ").map((p) => p.trim()).filter(Boolean);
          return (
            <Card key={c.name}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{c.name}</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tier.cls}`}>
                    {isHe ? tier.he : tier.en}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {moveParts.map((part, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm leading-6 text-foreground">
                      <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-emerald-600" aria-hidden />
                      <span className="min-w-0">{part}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-border/60 pt-2 text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {lang("מה זה אומר לכם: ", "What it means for you: ")}
                  </span>
                  {c.implication}
                </p>
                {c.lastChecked ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {lang(`נבדק לאחרונה: ${c.lastChecked}`, `Last checked: ${c.lastChecked}`)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Prescriptions: today / this week. Client component so it can show a
          loading spinner and fetch the BI analysis live (like the Meta
          insight) instead of a static "BI unavailable" banner that only
          updated on the next page load. */}
      <CompetitorBriefActionsBlock
        initial={{
          source: brief.source,
          today: brief.today,
          thisWeek: brief.thisWeek,
          generatedAt: brief.generatedAt
        }}
        isHe={isHe}
      />
    </div>
  );
}
