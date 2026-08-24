// The rhythm engine for /welcome.
//
// The reference design's whole identity is one section header repeated
// without deviation: eyebrow pill → tight-tracked H2 → two-line subhead.
// Doing it as a component rather than by hand is what keeps a long page
// feeling engineered instead of assembled — and means the tracking rule
// below is impossible to forget on one section.
//
// Tracking is read from --hl-track, set once on the page root per locale.
// Latin display type wants ~-0.045em; Hebrew has no side bearings to give
// and collides at anything negative, so it gets 0.

export function SectionHead({
  eyebrow,
  title,
  sub,
  align = "center"
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  align?: "center" | "start";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "flex flex-col items-center text-center" : "flex flex-col items-start text-start"}>
      <span
        className="inline-flex items-center rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
        style={{ borderColor: "rgba(209,115,31,.32)", color: "#D1731F", backgroundColor: "rgba(209,115,31,.07)" }}
      >
        {eyebrow}
      </span>
      <h2
        className="mt-5 text-[1.9rem] font-bold leading-[1.08] [font-family:var(--font-hl-display)] [text-wrap:balance] sm:text-[2.75rem]"
        style={{ letterSpacing: "var(--hl-track)", maxWidth: centered ? "18ch" : undefined }}
      >
        {title}
      </h2>
      {sub ? (
        <p
          className="mt-4 text-base leading-relaxed [text-wrap:pretty]"
          style={{ color: "#605D5D", maxWidth: "56ch" }}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}
