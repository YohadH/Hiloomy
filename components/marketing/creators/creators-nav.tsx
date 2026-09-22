"use client";

import { useEffect, useState } from "react";
import { HiloomyLogo } from "@/components/ui/logo";

const LINKS = [
  { href: "#flow", label: "איך זה עובד" },
  { href: "#sides", label: "שני הצדדים" },
  { href: "#how", label: "הטמעה" },
  { href: "#pricing", label: "מחיר" },
  { href: "#faq", label: "שאלות" }
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
        {/* The brand lockup ([mark]iloomy.) comes from the shared logo component
            so the landing never drifts from the app's logo. */}
        <a href="/creators" className="cr-logo" aria-label="Hiloomy Creator">
          <HiloomyLogo />
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
          {/* Wide screens get the full CTA; phones a short one next to the menu. */}
          <a href="#contact" className="cr-btn cr-btn-primary cr-btn-sm cr-nav-cta-wide">
            בואו נראה איך Hiloomy תעבוד אצלכם
          </a>
          <a href="#contact" className="cr-btn cr-btn-primary cr-btn-sm cr-nav-cta-narrow">
            דברו איתנו
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
              בואו נראה איך Hiloomy תעבוד אצלכם
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
