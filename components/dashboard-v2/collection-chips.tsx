/**
 * Render a horizontal stack of small "chip" pills for every Shopify collection
 * a product belongs to. When a product is in many collections, only the first
 * `maxVisible` are shown inline and the remainder collapse into a "+N more"
 * pill that opens a tooltip listing the rest.
 */
export function CollectionChips({
  collections,
  fallback,
  maxVisible = 3
}: {
  collections: string[];
  /** Shown when collections is empty (e.g. the legacy `collection` string). */
  fallback?: string;
  /** Max number of chips to render inline before collapsing the rest. */
  maxVisible?: number;
}) {
  if (!collections || collections.length === 0) {
    return fallback ? <span className="text-muted-foreground">{fallback}</span> : null;
  }

  const visible = collections.slice(0, maxVisible);
  const overflow = collections.slice(maxVisible);

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {visible.map((title, idx) => (
        <span
          key={`${title}-${idx}`}
          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
          title={title}
        >
          <span className="max-w-[140px] truncate">{title}</span>
        </span>
      ))}
      {overflow.length > 0 ? (
        <span className="group/tip relative inline-flex">
          <span className="inline-flex cursor-help items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
            +{overflow.length} more
          </span>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 translate-y-1 whitespace-normal rounded-lg border border-border/70 bg-foreground px-3 py-2 text-xs leading-5 text-background opacity-0 shadow-soft transition-[opacity,transform] duration-150 group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100"
          >
            <span className="font-semibold">All collections ({collections.length})</span>
            <span className="mt-1 block leading-5">{collections.join(" · ")}</span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Compact variant — chips in a single line with `nowrap`, suitable for
 * narrow table cells where wrapping would push everything around. Falls back
 * to the same overflow tooltip pattern.
 */
export function CollectionChipsInline({
  collections,
  fallback,
  maxVisible = 2
}: {
  collections: string[];
  fallback?: string;
  maxVisible?: number;
}) {
  return <CollectionChips collections={collections} fallback={fallback} maxVisible={maxVisible} />;
}

