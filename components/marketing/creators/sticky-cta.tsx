"use client";

import { useEffect, useState } from "react";

// Small bottom bar on phones: appears once the hero has scrolled away and
// hides again while the contact form, or any in-page copy of the same
// button ([data-inline-cta], e.g. the one in the #pricing card), is on
// screen, so the same button never shows twice. CSS hides it entirely on
// wide screens, where the nav's contact button is always in view.
export function StickyCta() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("top");
    const contact = document.getElementById("contact");
    if (!hero || !contact || !("IntersectionObserver" in window)) return;
    let pastHero = false;
    const covering = new Set<Element>();
    const update = () => setOn(pastHero && covering.size === 0);
    const heroIo = new IntersectionObserver(
      ([e]) => {
        pastHero = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        update();
      },
      { threshold: 0 }
    );
    // The contact form and every inline copy of the CTA: while any of them
    // is on screen, the bar stays hidden.
    const coverIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) covering.add(e.target);
          else covering.delete(e.target);
        }
        update();
      },
      { threshold: 0 }
    );
    heroIo.observe(hero);
    coverIo.observe(contact);
    document.querySelectorAll("[data-inline-cta]").forEach((el) => coverIo.observe(el));
    return () => {
      heroIo.disconnect();
      coverIo.disconnect();
    };
  }, []);

  return (
    <a href="#contact" className={`cr-sticky${on ? " is-on" : ""}`} aria-hidden={!on} tabIndex={on ? 0 : -1}>
      <span>בואו נדבר על המשפיענים שלכם</span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
        <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
