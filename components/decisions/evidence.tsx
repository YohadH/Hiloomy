import { cn } from "@/lib/utils";
import {
  QUALITY_LABEL,
  SOURCE_LABEL,
  type EvidenceFact,
  type EvidenceQuality,
  type EvidenceSource,
  type Localized
} from "@/lib/domain/decision";

type Locale = "he" | "en";

export function text(value: string | Localized | null | undefined, locale: Locale): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : value[locale];
}

// Known / Calculated / Estimated / Unavailable — always visible next to a
// number so a manager never mistakes an estimate for a fact.
const QUALITY_STYLE: Record<EvidenceQuality, string> = {
  known: "text-success",
  calculated: "text-muted-foreground",
  estimated: "text-warning",
  unavailable: "text-muted-foreground/80"
};

export function QualityTag({ quality, locale, className }: { quality: EvidenceQuality; locale: Locale; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", QUALITY_STYLE[quality], className)}>
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          quality === "unavailable" ? "border border-current bg-transparent" : "bg-current"
        )}
      />
      {QUALITY_LABEL[quality][locale]}
    </span>
  );
}

// Compact chip used on the inbox card: "37 · units remaining" with a quality
// dot. Unavailable facts render as a dashed chip so the gap is visible.
export function EvidenceChip({ fact, locale }: { fact: EvidenceFact; locale: Locale }) {
  const value = text(fact.value, locale);
  const note = text(fact.note, locale);
  const unavailable = value === null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
        unavailable ? "border-dashed border-border text-muted-foreground" : "border-border/80 bg-background/70 text-foreground"
      )}
      title={`${fact.label[locale]} · ${fact.sourceDetail[locale]} · ${QUALITY_LABEL[fact.quality][locale]}`}
    >
      <span className="text-xs text-muted-foreground">{fact.label[locale]}</span>
      <span className={cn("truncate font-semibold tabular-nums", unavailable && "font-medium")}>
        {unavailable ? QUALITY_LABEL.unavailable[locale] : value}
      </span>
      {!unavailable && note ? <span className="truncate text-muted-foreground">{note}</span> : null}
    </span>
  );
}

// Full evidence block for the receipt: grouped by source, every fact with
// its value, label, system of record, and quality.
export function EvidenceGroups({ evidence, locale }: { evidence: EvidenceFact[]; locale: Locale }) {
  const order: EvidenceSource[] = ["shopify", "inventory", "profit", "meta", "affiliate", "market", "plan"];
  const groups = order
    .map((source) => ({ source, facts: evidence.filter((f) => f.source === source) }))
    .filter((g) => g.facts.length > 0);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.source} className="rounded-xl border border-border/80 bg-background/60 p-4">
          <p className="text-xs font-medium text-muted-foreground">{SOURCE_LABEL[g.source][locale]}</p>
          <ul className="mt-3 space-y-3">
            {g.facts.map((f, i) => {
              const value = text(f.value, locale);
              const note = text(f.note, locale);
              return (
                <li key={i} className="space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cn("text-base font-semibold tabular-nums", value === null && "text-muted-foreground")}>
                      {value === null ? QUALITY_LABEL.unavailable[locale] : value}
                    </span>
                    <span className="text-sm text-muted-foreground">{note ?? f.label[locale]}</span>
                  </div>
                  {note ? <p className="text-xs text-muted-foreground">{f.label[locale]}</p> : null}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-muted-foreground">
                      {locale === "he" ? "מקור" : "Source"}: {f.sourceDetail[locale]}
                    </span>
                    <QualityTag quality={f.quality} locale={locale} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
