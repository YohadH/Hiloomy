"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HiloomyLogo } from "@/components/ui/logo";

// "Scattered sources → Hiloomy" diagram for the problem section. The tiles
// and the target card are plain HTML (so text wraps naturally at any width);
// the beams are an SVG overlay whose paths are measured from the live layout
// and re-measured on resize, so they always land on the right elements.
// A light pulse travels down each beam, staggered, with a pause between runs.

// Third-party marks keep their own colours so they stay recognisable; they are
// the only non-logo hues on the page. The coupon is Hiloomy's own idea and
// takes the logo orange from CSS (.cr-fv-coupon).
const MARKS = { whatsapp: "#25D366", excel: "#107C41", shopify: "#95BF47", shopifyHandle: "#A3CF62", glyph: "#FFFFFF" } as const;

// In the labels "\u00a0/" ties each slash to the word before it, so a wrapped
// line never starts with "/" (the text reads the same).
const SOURCES: { label: string; icon: ReactNode }[] = [
  {
    label: "WhatsApp",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" fill={MARKS.whatsapp} />
        <path
          d="M9.2 7.8c.3-.1.6 0 .7.3l.7 1.6c.1.3 0 .5-.2.7l-.5.5a6 6 0 0 0 3 3l.5-.5c.2-.2.5-.3.7-.2l1.6.7c.3.1.4.4.3.7-.3 1-1.2 1.6-2.2 1.4a7.6 7.6 0 0 1-5.5-5.5c-.2-1 .4-1.9 1.4-2.2z"
          fill={MARKS.glyph}
        />
      </svg>
    )
  },
  {
    label: "Excel\u00a0/ Google Sheets",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="3" width="15" height="18" rx="2.5" fill={MARKS.excel} />
        <path d="M8 9h8M8 12.5h8M8 16h8M12 9v7" stroke={MARKS.glyph} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  },
  {
    label: "Shopify\u00a0/ WooCommerce\u00a0/ Wix",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" fill="none" stroke={MARKS.shopifyHandle} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5.5 8h13l-1 12.5h-11L5.5 8z" fill={MARKS.shopify} />
        <path d="M9.5 12.5a2.5 2.5 0 0 0 5 0" fill="none" stroke={MARKS.glyph} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    label: "קודי קופון",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 7v2.5a2.5 2.5 0 0 0 0 5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17v-2.5a2.5 2.5 0 0 0 0-5V7z"
          className="cr-fv-coupon"
        />
        <path d="M9.5 14.5l5-5" stroke={MARKS.glyph} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9.8" cy="9.8" r="1.1" fill={MARKS.glyph} />
        <circle cx="14.2" cy="14.2" r="1.1" fill={MARKS.glyph} />
      </svg>
    )
  }
];

const OUTPUTS = ["משפיענים", "מכירות", "עמלות", "סטטוסי תשלום"];

type Geometry = { w: number; h: number; paths: string[]; y1: number; y2: number };

export function SourceFlow() {
  const root = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const target = el.querySelector(".cr-fv-target")?.getBoundingClientRect();
      if (!target) return;
      const tx = target.left + target.width / 2 - box.left;
      const ty = target.top - box.top;
      const srcs = Array.from(el.querySelectorAll(".cr-fv-src"));
      const y1 = Math.min(...srcs.map((s) => s.getBoundingClientRect().bottom)) - box.top;
      const paths = srcs.map((src) => {
        const r = src.getBoundingClientRect();
        const x = r.left + r.width / 2 - box.left;
        const y = r.bottom - box.top + 8;
        // Land slightly spread across the card's top edge so beams don't
        // pile onto one pixel, keeping each beam on its own side.
        const ex = tx + (x - tx) * 0.22;
        const my = (y + ty) / 2;
        return `M${x.toFixed(1)} ${y.toFixed(1)} C${x.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ty.toFixed(1)}`;
      });
      setGeo({ w: box.width, h: box.height, paths, y1, y2: ty });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="cr-fv" ref={root} aria-label="ממקורות מפוזרים ל־Hiloomy">
      <div className="cr-dots" aria-hidden="true" />
      {geo ? (
        <svg className="cr-fv-beams" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
          {/* Pulses leave the scattered sources orange (the influencer side) and
              arrive at Hiloomy green: the logo's two colours, in motion. */}
          <defs>
            <linearGradient id="cr-beam-grad" gradientUnits="userSpaceOnUse" x1="0" y1={geo.y1} x2="0" y2={geo.y2}>
              <stop className="s-spark" offset="0.1" />
              <stop className="s-glow" offset="0.9" />
            </linearGradient>
          </defs>
          {geo.paths.map((d, i) => (
            <g key={i} style={{ "--i": i } as CSSProperties}>
              <path className="base" d={d} />
              <path className="pulse" d={d} pathLength={100} />
            </g>
          ))}
        </svg>
      ) : null}
      <ul className="cr-fv-sources">
        {SOURCES.map((s) => (
          <li key={s.label} className="cr-fv-src">
            <span className="cr-fv-tile">{s.icon}</span>
            <span className="cr-fv-label">{s.label}</span>
          </li>
        ))}
      </ul>
      <div className="cr-fv-target">
        <HiloomyLogo className="cr-fv-logo" textClassName="cr-wordmark" />
        <ul className="cr-fv-outs">
          {OUTPUTS.map((t) => (
            <li key={t}>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
