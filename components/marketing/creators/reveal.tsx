"use client";

import { useEffect } from "react";

// Adds `is-in` to every [data-reveal] element once it enters the viewport.
// Enhancement only: without JS (or with reduced motion) the CSS shows
// everything immediately.
export function RevealOnScroll() {
  useEffect(() => {
    document.documentElement.classList.add("cr-js");
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!nodes.length) return;
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((n) => n.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => {
      io.disconnect();
      document.documentElement.classList.remove("cr-js");
    };
  }, []);
  return null;
}
