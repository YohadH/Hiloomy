"use client";

import { useEffect, useState } from "react";

// Small bottom bar on phones: appears once the hero has scrolled away and
// hides again while the contact form is on screen. CSS hides it entirely on
// wide screens, where the nav already carries the CTA.
export function StickyCta() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("top");
    const contact = document.getElementById("contact");
    if (!hero || !contact || !("IntersectionObserver" in window)) return;
    let pastHero = false;
    let atContact = false;
    const update = () => setOn(pastHero && !atContact);
    const heroIo = new IntersectionObserver(
      ([e]) => {
        pastHero = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        update();
      },
      { threshold: 0 }
    );
    const contactIo = new IntersectionObserver(
      ([e]) => {
        atContact = e.isIntersecting;
        update();
      },
      { threshold: 0 }
    );
    heroIo.observe(hero);
    contactIo.observe(contact);
    return () => {
      heroIo.disconnect();
      contactIo.disconnect();
    };
  }, []);

  return (
    <a href="#contact" className={`cr-sticky${on ? " is-on" : ""}`} aria-hidden={!on} tabIndex={on ? 0 : -1}>
      <span>רוצים לראות איך זה עובד?</span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
        <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
