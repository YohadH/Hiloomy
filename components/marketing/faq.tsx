// FAQ accordion. Native <details>/<summary> so it needs no client JS, works
// with keyboard and screen readers for free, and stays open on print.
// The marker is drawn with CSS; the default disclosure triangle is removed
// because it can't be positioned logically in RTL.

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <style>{`
        .hl-faq summary::-webkit-details-marker{display:none}
        .hl-faq summary::marker{content:""}
        .hl-faq details[open] .hl-faq-plus{transform:rotate(45deg)}
        .hl-faq details[open] summary{color:#14512C}
      `}</style>
      <div className="hl-faq flex flex-col gap-2.5">
        {items.map((item) => (
          <details
            key={item.q}
            className="group overflow-hidden rounded-2xl border bg-white"
            style={{ borderColor: "rgba(32,30,29,.13)" }}
          >
            <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 text-[15px] font-bold transition-colors hover:text-[#14512C]">
              <span className="flex-1">{item.q}</span>
              <span
                className="hl-faq-plus grid h-6 w-6 flex-none place-items-center rounded-full text-base leading-none transition-transform duration-200"
                style={{ backgroundColor: "rgba(209,115,31,.10)", color: "#D1731F" }}
                aria-hidden
              >
                +
              </span>
            </summary>
            <p className="px-5 pb-5 text-[15px] leading-relaxed" style={{ color: "#605D5D" }}>
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
