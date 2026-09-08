import Link from "next/link";

// Editorial hierarchy: a title and one line of context. The old green
// uppercase "eyebrow" is gone from the screen — the prop stays so the many
// call sites keep compiling, and it is exposed as the heading's `aria-label`
// prefix for screen readers only.
export function SectionHead({
  eyebrow,
  title,
  hint,
  cta
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl" aria-label={`${eyebrow}: ${title}`}>
          {title}
        </h2>
        {hint ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{hint}</p> : null}
      </div>
      {cta ? (
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          href={cta.href as any}
          className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">{eyebrow}</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p> : null}
    </div>
  );
}
