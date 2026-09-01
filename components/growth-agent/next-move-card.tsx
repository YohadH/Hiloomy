"use client";

// Hiloma's next move — renders the analyst's fixed-format answer (bottom
// line / numbers / move / watch). While the answer is being generated the
// card polls the page (router.refresh) every 20s, up to ~3 minutes.

import { useEffect, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import type { HilomaNextMove } from "@/lib/services/hiloma-next-move-service";

// Minimal, injection-safe inline markdown: **bold** and *italic* (element-based).
function renderRich(text: string): Array<string | ReactElement> {
  const out: Array<string | ReactElement> = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={key++}>{m[2]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function NextMoveCard({
  move,
  pending,
  available,
  locale
}: {
  move: HilomaNextMove | null;
  pending: boolean;
  available: boolean;
  locale: "he" | "en";
}) {
  const isHe = locale === "he";
  const router = useRouter();
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (!pending || move || polls >= 9) return;
    const t = setTimeout(() => {
      setPolls((p) => p + 1);
      router.refresh();
    }, 20_000);
    return () => clearTimeout(t);
  }, [pending, move, polls, router]);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-white p-5 shadow-sm dark:from-emerald-950/30 dark:via-card dark:to-card">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">{isHe ? "המהלך הבא לפי הילומה" : "Hiloma's next move"}</p>
          <p className="text-[11px] text-muted-foreground">
            {move
              ? isHe
                ? `נכתב ${new Date(move.generatedAt).toLocaleString("he-IL")} · מתעדכן פעם ביום`
                : `Written ${new Date(move.generatedAt).toLocaleString("en-GB")} · refreshes daily`
              : isHe
                ? "מבוסס על הנתונים החיים של החנות — לא טיפ כללי"
                : "Based on the store's live data — not a generic tip"}
          </p>
        </div>
      </div>

      <div className="mt-4 text-sm leading-6 text-foreground">
        {!available ? (
          <p className="text-muted-foreground">
            {isHe ? "הילומה לא מחוברת בסביבה הזו." : "Hiloma isn't connected in this environment."}
          </p>
        ) : move ? (
          <div className="space-y-1.5 whitespace-pre-wrap" dir={isHe ? "rtl" : "ltr"}>
            {renderRich(move.text)}
          </div>
        ) : (
          <p className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {isHe
              ? "הילומה בודקת את הנתונים של השבוע — זה לוקח עד דקה-שתיים, הדף יתעדכן לבד."
              : "Hiloma is going through this week's data — up to a minute or two; the page refreshes itself."}
          </p>
        )}
      </div>
    </div>
  );
}
