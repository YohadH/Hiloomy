import { LayoutGrid, ArrowUp, ArrowDown, X, Minus } from "lucide-react";
import type {
  HomepageMerchandiserReport,
  MerchandiserMove,
  ScoredProduct
} from "@/lib/services/homepage-merchandiser-service";

// Homepage merchandiser — ranks the store's products for homepage placement by
// the Homepage Slot Score (margin + revenue + momentum + stock cover).
// Recommend-only: it shows the order Hiloma would set and the single strongest
// reason per product; the Shopify write-back is a later, approval-gated
// increment. The competitor-edge signal is held out until RivalSweeper
// delivers per-SKU matching — noted in the footer so the score's basis is honest.

const MOVE_STYLE: Record<
  MerchandiserMove,
  { he: string; en: string; className: string; Icon: typeof ArrowUp }
> = {
  promote: {
    he: "לקדם",
    en: "promote",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    Icon: ArrowUp
  },
  hold: {
    he: "להשאיר",
    en: "hold",
    className: "border-border bg-muted/60 text-muted-foreground",
    Icon: Minus
  },
  demote: {
    he: "להוריד",
    en: "demote",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    Icon: ArrowDown
  },
  remove: {
    he: "להסיר",
    en: "remove",
    className:
      "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
    Icon: X
  }
};

function Row({ p, index, isHe }: { p: ScoredProduct; index: number; isHe: boolean }) {
  const move = MOVE_STYLE[p.move];
  const MoveIcon = move.Icon;
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{p.title}</p>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${move.className}`}
          >
            <MoveIcon className="h-3 w-3" aria-hidden />
            {isHe ? move.he : move.en}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
          {isHe ? p.reason.he : p.reason.en}
        </p>
      </div>
      <div className="shrink-0 text-end">
        <p className="text-sm font-bold tabular-nums text-foreground">{p.hss}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">HSS</p>
      </div>
    </li>
  );
}

export function HomepageMerchandiserPanel({
  report,
  isHe
}: {
  report: HomepageMerchandiserReport;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);

  if (report.scored.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" aria-hidden />
          {lang(
            "אין מספיק נתוני מכירות ועלויות כדי לדרג את עמוד הבית עדיין. ברגע שיש מכירות עם עלות מוצר, הילומה תדרג כאן.",
            "Not enough sales + cost data to rank the homepage yet. Once products sell with a known cost, Hiloma ranks them here."
          )}
        </span>
      </div>
    );
  }

  // Show the top candidates for a hero slot; the remove list is always worth
  // surfacing because a failing hero actively wastes homepage traffic.
  const top = report.scored.filter((p) => p.move !== "remove").slice(0, 8);
  const remove = report.removeList.slice(0, 5);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/70 px-5 py-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold">
          <LayoutGrid className="h-4 w-4 text-emerald-600" aria-hidden />
          {lang("סדר מומלץ לעמוד הבית", "Recommended homepage order")}
        </p>
        <p className="text-xs text-muted-foreground">
          {lang(
            `${report.windowDays} ימים · לפי רווח, הכנסה, תאוצה ומלאי`,
            `${report.windowDays}d · by margin, revenue, momentum & stock`
          )}
        </p>
      </div>

      <ol className="divide-y divide-border/60">
        {top.map((p, i) => (
          <Row key={p.productId} p={p} index={i} isHe={isHe} />
        ))}
      </ol>

      {remove.length > 0 ? (
        <div className="border-t border-border/70 bg-rose-50/40 px-5 py-3 dark:bg-rose-950/10">
          <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
            {lang("להוריד מעמוד הבית", "Take off the homepage")}
          </p>
          <ul className="mt-1 space-y-1">
            {remove.map((p) => (
              <li key={p.productId} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate text-foreground">{p.title}</span>
                <span className="shrink-0 text-muted-foreground">{isHe ? p.reason.he : p.reason.en}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-border/70 px-5 py-2.5 text-[11px] leading-4 text-muted-foreground">
        {lang(
          "המלצה בלבד — הילומה לא משנה את החנות. יתרון המתחרים (מחיר וזמינות מול אותו מוצר) יתווסף לניקוד כשהנתונים ברמת המוצר יגיעו מ-RivalSweeper.",
          "Recommendation only — Hiloma doesn't change your store. The competitor edge (rival price & availability on the same product) joins the score once per-SKU data arrives from RivalSweeper."
        )}
      </p>
    </div>
  );
}
