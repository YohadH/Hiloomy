import Link from "next/link";

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
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
          {eyebrow}
        </p>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {hint ? (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {cta ? (
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          href={cta.href as any}
          className="text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-500"
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
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {description ? (
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}
