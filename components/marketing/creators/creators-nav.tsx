"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { href: "#product", label: "המוצר" },
  { href: "#how", label: "איך זה עובד" },
  { href: "#pricing", label: "מחירים" },
  { href: "#faq", label: "שאלות נפוצות" }
];

export function CreatorsNav() {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`cr-nav${stuck ? " is-stuck" : ""}`}>
      <div className="cr-wrap cr-nav-bar">
        <a href="/creators" className="cr-logo" aria-label="Hiloomy Creator">
          <svg viewBox="11 9.7 27 27.3" fill="none" aria-hidden="true" width="26" height="26">
            <rect x="11.5" y="17" width="6.2" height="19.5" rx="2.8" fill="#15A34A" />
            <rect x="16.5" y="24.5" width="11.5" height="4.4" fill="#15A34A" />
            <rect x="27.5" y="18.2" width="6.2" height="18.3" rx="2.6" fill="#F97316" />
            <path d="M30.6 10.2L37.6 18.8H23.6L30.6 10.2Z" fill="#F97316" />
          </svg>
          <span className="cr-logo-word">
            Hiloomy <span className="cr-logo-sub">Creator</span>
          </span>
        </a>
        <nav className="cr-nav-links" aria-label="ניווט ראשי">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="cr-nav-actions">
          <a href="#contact" className="cr-btn cr-btn-primary cr-btn-sm">
            בואו נבדוק את מערך היוצרים שלכם
          </a>
          <button
            type="button"
            className="cr-menu-btn"
            aria-label={open ? "סגירת תפריט" : "פתיחת תפריט"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {open ? (
        <div className="cr-sheet" role="dialog" aria-label="תפריט">
          <nav className="cr-wrap cr-sheet-links">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg" onClick={() => setOpen(false)}>
              בואו נבדוק את מערך היוצרים שלכם
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
