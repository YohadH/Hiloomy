import Link from "next/link";
import { cn } from "@/lib/utils";
import { SALES_CHANNEL_FILTERS, SALES_CHANNEL_FILTER_LABEL, type SalesChannelFilter } from "@/lib/domain/sales-channel";

// Segmented control for the Command Center's money + trend sections:
// all / online only / POS only. Plain links that keep the date-range query
// (?preset / ?start&end) so the window never changes under the reader.
export function ChannelFilterControl({
  value,
  query,
  locale
}: {
  value: SalesChannelFilter;
  query: Record<string, string | string[] | undefined>;
  locale: "he" | "en";
}) {
  const hrefFor = (channel: SalesChannelFilter) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (k === "channel" || v === undefined) continue;
      params.set(k, Array.isArray(v) ? v[0] : v);
    }
    if (channel !== "all") params.set("channel", channel);
    const qs = params.toString();
    return qs ? `/dashboard?${qs}` : "/dashboard";
  };
  return (
    <div role="group" aria-label={locale === "he" ? "ערוץ מכירה" : "Sales channel"} className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
      {SALES_CHANNEL_FILTERS.map((c) => (
        <Link
          key={c}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          href={hrefFor(c) as any}
          aria-current={c === value ? "true" : undefined}
          className={cn("rounded px-2.5 py-1 font-medium", c === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
        >
          {SALES_CHANNEL_FILTER_LABEL[c][locale]}
        </Link>
      ))}
    </div>
  );
}
