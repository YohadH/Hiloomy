"use client";

import { useEffect } from "react";
import { CSS, BODY, initCompanyLanding } from "./company-landing.data";

// The approved "company" redesign for /welcome. The design — CSS, markup and
// the hand-authored vanilla-JS interactions (grab-and-throw agent cards, the
// data→brain converge canvas, count-ups, scroll reveals, the mobile menu) —
// is ported verbatim from the design artifact and lives in
// company-landing.data.js. This wrapper injects it and runs the interactions
// once on mount. Fonts resolve from --font-hl-display / --font-hl-body, which
// the page sets via next/font. Video is served from /public.
//
// Kept as an injected block rather than hand-converted JSX so the pixel-exact
// approved design ships unchanged; refactor into React sections incrementally.

let started = false;

export default function CompanyLanding() {
  useEffect(() => {
    if (started) return; // guard React strict-mode double-invoke / remounts
    started = true;
    try {
      initCompanyLanding();
    } catch (err) {
      // The interactions are enhancement only. A bug in them (e.g. the
      // script referencing a section that was later cut from the markup)
      // must degrade to a static page — NOT throw out of the effect and
      // feed the whole homepage to the error boundary, which is exactly
      // what took /welcome down on 31 Aug 2026 (observe(null) on the
      // removed #dash hero mock).
      console.error("[company-landing] interactions failed to start:", err);
    }
  }, []);

  return (
    <div dir="rtl" className="hl-landing">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div dangerouslySetInnerHTML={{ __html: BODY }} />
    </div>
  );
}
