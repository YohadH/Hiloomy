"use client";

import { useEffect, useRef, useState } from "react";

// The sample weekly report — six stacked "PDF pages" with a sticky
// stacking scroll effect and a table-of-contents scrollspy, from the
// broadsheet redesign. All copy/data arrives via props (bilingual in
// the server page). Mobile: TOC becomes a horizontal chip bar, tables
// scroll inside their own container.

const INK = "#201E1D";
const GREEN = "#14512C";
const ORANGE = "#D1731F";
const RED = "#A8521A";
const DIM = "#605D5D";
const HAIR = "rgba(32,30,29,.12)";

export interface ReportCopy {
  indexLabel: string;
  p1Kicker: string;
  p1Week: string;
  p1Headline: string;
  p1NumberLabel: string;
  p2Kicker: string;
  p2Meta: string;
  p2Title: string;
  p3Kicker: string;
  p3Meta: string;
  p3Title: string;
  p4Kicker: string;
  p4Meta: string;
  p4Title: string;
  p4Cols: [string, string, string, string, string];
  p4Note: string;
  p5Kicker: string;
  p5Meta: string;
  p5Title: string;
  p6Kicker: string;
  p6Meta: string;
  p6Title: string;
  p6Affiliates: string;
  p6Retention: string;
  p6Note: string;
  pages: Array<{ num: string; navTitle: string }>;
}

export interface ReportData {
  p1Number: string;
  p1Delta: string;
  p1Meta: Array<{ k: string; v: string }>;
  p2Rows: Array<{ k: string; now: string; prev: string; delta: string; tone: "up" | "down" | "flat" }>;
  p2Bars: Array<{ h: string; label: string; color: string }>;
  p3Flags: Array<{ priority: string; source: string; tone: "high" | "medium"; title: string; action: string }>;
  p4Campaigns: Array<{ name: string; spend: string; revenue: string; roas: string; verdict: string; tone: "up" | "down" | "flat" }>;
  p5Actions: Array<{ num: string; title: string; why: string; owner: string }>;
  p6Affiliates: Array<{ k: string; v: string }>;
  p6Retention: Array<{ k: string; v: string }>;
}

const toneColor = (tone: "up" | "down" | "flat") =>
  tone === "up" ? GREEN : tone === "down" ? RED : DIM;

function Kicker({ children, meta }: { children: React.ReactNode; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-3" style={{ borderColor: INK }}>
      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: ORANGE }}>
        {children}
      </p>
      {meta ? (
        <p className="text-[11px]" style={{ color: DIM }}>
          {meta}
        </p>
      ) : null}
    </div>
  );
}

function SheetTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-5 text-xl font-normal leading-snug [font-family:var(--font-hl-display)] sm:text-3xl" style={{ color: INK }}>
      {children}
    </h3>
  );
}

export function ReportSheets({ t, d }: { t: ReportCopy; d: ReportData }) {
  const sheetsRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const root = sheetsRef.current;
      if (!root) return;
      let idx = 0;
      Array.from(root.children).forEach((k, i) => {
        if ((k as HTMLElement).getBoundingClientRect().top <= 190) idx = i;
      });
      setActive((cur) => (cur === idx ? cur : idx));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (i: number) => {
    const el = sheetsRef.current?.children[i] as HTMLElement | undefined;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - (100 + i * 14);
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  // Sheets already passed by the reader shrink slightly under the pile.
  const depth = (i: number) => {
    const under = active - i;
    if (under <= 0) return "scale(1)";
    return `scale(${Math.max(0.955, 1 - under * 0.015)}) translateY(${-under * 4}px)`;
  };

  const sheetClass =
    "rounded-2xl border bg-white p-6 shadow-xl transition-transform duration-300 sm:p-10";
  const sheetStyle = (i: number) => ({
    borderColor: HAIR,
    position: "sticky" as const,
    top: 100 + i * 14,
    transform: depth(i),
    boxShadow: "0 24px 60px -30px rgba(18,52,31,.35)"
  });

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 pb-24 sm:px-10 lg:grid-cols-[200px_1fr]">
      {/* TOC — sticky rail on desktop, horizontal chips on mobile */}
      <div className="min-w-0">
        <div className="sticky top-24 hidden lg:block">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: DIM }}>
            {t.indexLabel}
          </p>
          <div className="mt-3">
            {t.pages.map((p, i) => (
              <button
                key={p.num}
                type="button"
                onClick={() => goTo(i)}
                className="flex w-full items-center gap-3 border-t py-2.5 text-start text-sm font-bold transition-colors"
                style={{ borderColor: HAIR, color: active === i ? GREEN : INK }}
              >
                <span className="text-[11px]" style={{ color: ORANGE }}>
                  {p.num}
                </span>
                {p.navTitle}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:hidden [scrollbar-width:none]">
          {t.pages.map((p, i) => (
            <button
              key={p.num}
              type="button"
              onClick={() => goTo(i)}
              className="shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors"
              style={
                active === i
                  ? { backgroundColor: GREEN, borderColor: GREEN, color: "#fff" }
                  : { borderColor: "rgba(32,30,29,.25)", color: INK, backgroundColor: "#fff" }
              }
            >
              {p.num} · {p.navTitle}
            </button>
          ))}
        </div>
      </div>

      {/* The six sheets */}
      <div ref={sheetsRef} className="min-w-0 space-y-6">
        {/* 01 — cover */}
        <div className={sheetClass} style={sheetStyle(0)}>
          <Kicker meta={t.p1Week}>{t.p1Kicker}</Kicker>
          <SheetTitle>{t.p1Headline}</SheetTitle>
          <p className="mt-8 text-[11px] font-bold uppercase tracking-widest" style={{ color: DIM }}>
            {t.p1NumberLabel}
          </p>
          <p className="mt-1 text-5xl font-normal tabular-nums [font-family:var(--font-hl-display)] sm:text-6xl" style={{ color: GREEN }}>
            {d.p1Number}
          </p>
          <p className="mt-1.5 text-sm font-bold" style={{ color: GREEN }}>
            {d.p1Delta}
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4 border-t pt-5" style={{ borderColor: HAIR }}>
            {d.p1Meta.map((m) => (
              <div key={m.k}>
                <p className="text-[11px]" style={{ color: DIM }}>
                  {m.k}
                </p>
                <p className="mt-0.5 text-base font-bold tabular-nums sm:text-lg" style={{ color: INK }}>
                  {m.v}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 02 — what changed */}
        <div className={sheetClass} style={sheetStyle(1)}>
          <Kicker meta={t.p2Meta}>{t.p2Kicker}</Kicker>
          <SheetTitle>{t.p2Title}</SheetTitle>
          <div className="mt-7 grid gap-8 md:grid-cols-[1.2fr_1fr]">
            <div>
              {d.p2Rows.map((row) => (
                <div key={row.k} className="flex items-center justify-between border-b py-3 text-sm" style={{ borderColor: HAIR }}>
                  <span style={{ color: DIM }}>{row.k}</span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="hidden text-xs sm:inline" style={{ color: DIM }} dir="ltr">
                      {row.prev}
                    </span>
                    <span className="font-bold" style={{ color: INK }} dir="ltr">
                      {row.now}
                    </span>
                    <span className="w-14 text-end text-xs font-bold" style={{ color: toneColor(row.tone) }} dir="ltr">
                      {row.delta}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex h-44 items-end gap-2 md:h-auto" aria-hidden>
              {d.p2Bars.map((bar) => (
                <div key={bar.label} className="flex flex-1 flex-col items-center gap-1.5 self-stretch justify-end">
                  <div className="w-full rounded-t-[3px]" style={{ height: bar.h, backgroundColor: bar.color }} />
                  <span className="text-[10px]" style={{ color: DIM }}>
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 03 — red flags */}
        <div className={sheetClass} style={sheetStyle(2)}>
          <Kicker meta={t.p3Meta}>{t.p3Kicker}</Kicker>
          <SheetTitle>{t.p3Title}</SheetTitle>
          <div className="mt-7 space-y-4">
            {d.p3Flags.map((flag) => (
              <div key={flag.title} className="rounded-xl border p-5" style={{ borderColor: HAIR }}>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={
                      flag.tone === "high"
                        ? { backgroundColor: "#FBE3D0", color: RED }
                        : { backgroundColor: "#FBE3D0", color: ORANGE }
                    }
                  >
                    {flag.priority}
                  </span>
                  <span style={{ color: DIM }}>{flag.source}</span>
                </div>
                <p className="mt-2.5 text-lg font-bold" style={{ color: INK }}>
                  {flag.title}
                </p>
                <p className="mt-1.5 text-sm" style={{ color: DIM }}>
                  {flag.action}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 04 — Meta Ads table */}
        <div className={sheetClass} style={sheetStyle(3)}>
          <Kicker meta={t.p4Meta}>{t.p4Kicker}</Kicker>
          <SheetTitle>{t.p4Title}</SheetTitle>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wider" style={{ borderColor: INK, color: DIM }}>
                  <th className="py-2.5 text-start font-bold">{t.p4Cols[0]}</th>
                  <th className="py-2.5 text-end font-bold">{t.p4Cols[1]}</th>
                  <th className="py-2.5 text-end font-bold">{t.p4Cols[2]}</th>
                  <th className="py-2.5 text-end font-bold">{t.p4Cols[3]}</th>
                  <th className="py-2.5 text-end font-bold">{t.p4Cols[4]}</th>
                </tr>
              </thead>
              <tbody>
                {d.p4Campaigns.map((c) => (
                  <tr key={c.name} className="border-b" style={{ borderColor: HAIR }}>
                    <td className="py-3 font-bold" style={{ color: INK }} dir="ltr">
                      {c.name}
                    </td>
                    <td className="py-3 text-end tabular-nums" dir="ltr">
                      {c.spend}
                    </td>
                    <td className="py-3 text-end tabular-nums" dir="ltr">
                      {c.revenue}
                    </td>
                    <td className="py-3 text-end tabular-nums">{c.roas}</td>
                    <td className="py-3 text-end font-bold" style={{ color: toneColor(c.tone) }}>
                      {c.verdict}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 border-t pt-4 text-sm italic leading-relaxed" style={{ borderColor: HAIR, color: DIM }}>
            {t.p4Note}
          </p>
        </div>

        {/* 05 — actions */}
        <div className={sheetClass} style={sheetStyle(4)}>
          <Kicker meta={t.p5Meta}>{t.p5Kicker}</Kicker>
          <SheetTitle>{t.p5Title}</SheetTitle>
          <div className="mt-7 space-y-3.5">
            {d.p5Actions.map((action) => (
              <div key={action.num} className="flex items-start gap-4 border-b pb-3.5" style={{ borderColor: HAIR }}>
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white [font-family:var(--font-hl-display)]"
                  style={{ backgroundColor: GREEN }}
                >
                  {action.num}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold" style={{ color: INK }}>
                    {action.title}
                  </p>
                  <p className="mt-0.5 text-sm" style={{ color: DIM }}>
                    {action.why}
                  </p>
                </div>
                <span
                  className="mt-1 shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ borderColor: HAIR, color: DIM }}
                >
                  {action.owner}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 06 — affiliates & retention */}
        <div className={sheetClass} style={sheetStyle(5)}>
          <Kicker meta={t.p6Meta}>{t.p6Kicker}</Kicker>
          <SheetTitle>{t.p6Title}</SheetTitle>
          <div className="mt-7 grid gap-8 sm:grid-cols-2">
            {[
              { label: t.p6Affiliates, rows: d.p6Affiliates },
              { label: t.p6Retention, rows: d.p6Retention }
            ].map((block) => (
              <div key={block.label}>
                <p className="border-b pb-2 text-[11px] font-bold uppercase tracking-widest" style={{ borderColor: INK, color: ORANGE }}>
                  {block.label}
                </p>
                {block.rows.map((row) => (
                  <div key={row.k} className="flex items-center justify-between border-b py-2.5 text-sm" style={{ borderColor: HAIR }}>
                    <span style={{ color: DIM }}>{row.k}</span>
                    <span className="font-bold tabular-nums" style={{ color: INK }} dir="ltr">
                      {row.v}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-6 border-t pt-4 text-sm italic leading-relaxed" style={{ borderColor: HAIR, color: DIM }}>
            {t.p6Note}
          </p>
        </div>
      </div>
    </div>
  );
}
