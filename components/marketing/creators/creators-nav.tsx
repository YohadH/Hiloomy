"use client";

import { useEffect, useState } from "react";
import { HiloomyLogo } from "@/components/ui/logo";

const LINKS = [
  { href: "#flow", label: "איך זה עובד" },
  { href: "#sides", label: "מותג ומשפיען" },
  { href: "#how", label: "הטמעה" },
  { href: "#pricing", label: "מחיר" },
  { href: "#faq", label: "שאלות" }
];

// `cta` is the landing's main CTA sentence, passed in so the sheet button
// never drifts from the hero button.
export function CreatorsNav({ cta }: { cta: string }) {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  // True while the bar sits over a dark section ([data-nav-dark]): text goes
  // light and the stuck bar turns into dark glass instead of muddy light glass.
  const [onDark, setOnDark] = useState(true);

  useEffect(() => {
    const darks = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-dark]"));
    const onScroll = () => {
      setStuck(window.scrollY > 24);
      setOnDark(
        darks.some((el) => {
          const r = el.getBoundingClientRect();
          return r.top <= 32 && r.bottom > 32;
        })
      );
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock scroll on <html>, not <body>: globals.css clips html's overflow-x, so
  // body's overflow never reaches the viewport. A hidden body would become its
  // own (unscrollable) scroller, the sticky bar would stick to it and jump off
  // screen, and the page behind would still scroll.
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`cr-nav${stuck ? " is-stuck" : ""}${open ? " is-open" : ""}${onDark ? " on-dark" : ""}`}>
      <div className="cr-wrap cr-nav-bar">
        {/* The brand lockup ([mark]iloomy.) comes from the shared logo component
            so the landing never drifts from the app's logo. */}
        <a href="/creators" className="cr-logo" aria-label="Hiloomy Creator">
          <HiloomyLogo textClassName="cr-wordmark" />
          <span className="cr-logo-sub">Creator</span>
        </a>
        <nav className="cr-nav-links" aria-label="ניווט ראשי">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="cr-nav-actions">
          {/* One short label at every width: the hero button right below already
              carries the full CTA sentence, so the first screen never shows it twice. */}
          <a href="#contact" className="cr-btn cr-btn-primary cr-btn-sm">
            דברו איתנו
          </a>
          <button
            type="button"
            className="cr-menu-btn"
            aria-label={open ? "סגירת תפריט" : "פתיחת תפריט"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {/* Hamburger morphs into an X: top/bottom bars rotate, middle fades. */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ transform: open ? "translateY(5px) rotate(45deg)" : "none" }}
              />
              <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: open ? 0 : 1 }} />
              <path
                d="M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ transform: open ? "translateY(-5px) rotate(-45deg)" : "none" }}
              />
            </svg>
          </button>
        </div>
      </div>
      {/* Always mounted so the panel leaves along the same path it came in. */}
      <button type="button" className="cr-scrim" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} />
      <div className="cr-sheet" role="dialog" aria-label="תפריט ניווט" inert={!open}>
        <nav className="cr-sheet-links">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg" onClick={() => setOpen(false)}>
            {cta}
          </a>
        </nav>
      </div>
    </header>
  );
}
