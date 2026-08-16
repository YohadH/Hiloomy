// Module visibility flags — MVP packaging mechanism (disable, don't delete).
//
// DISABLED_MODULES is a comma-separated list of module slugs hidden from the
// sidebar nav (e.g. "creative,creator-flow,product-follow-ups"). Code, data
// and routes stay intact — re-enabling a module is a config change, no
// deploy. Direct URLs remain reachable; real per-plan route blocking arrives
// with billing packages.
//
// Valid slugs (see components/layout/sidebar.tsx): portfolio,
// marketing-planner, creative, affiliate-portal, weekly-summary,
// creator-flow, sales-summary, product-follow-ups, alerts.
// The Command Center (/) and Settings are core and cannot be disabled.

export function getDisabledModules(): string[] {
  return parseSlugList(process.env.DISABLED_MODULES);
}

// LOCKED_MODULES — same slugs as DISABLED_MODULES, but the nav item stays
// VISIBLE: greyed out with a padlock instead of removed. This is the
// Lebesgue-style "see the value, then pay" packaging — the module exists,
// it's right there, it needs an upgrade. A slug present in BOTH lists is
// treated as disabled (hidden wins over locked).
export function getLockedModules(): string[] {
  const disabled = new Set(getDisabledModules());
  return parseSlugList(process.env.LOCKED_MODULES).filter((slug) => !disabled.has(slug));
}

function parseSlugList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
