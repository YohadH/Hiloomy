"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

// Interactive sections of the marketing landing (/welcome), implementing
// the "financial broadsheet" redesign: a sticky three-layer scroll story,
// an accordion feature grid, and a pricing block with an ILS/USD toggle.
// All copy arrives as props from the server page (bilingual there).

const INK = "#201E1D";
const GREEN = "#14512C";
const ORANGE = "#D1731F";
const DIM = "#605D5D";

/* ── Mobile nav drawer ─────────────────────────────────────────────── */

export function MobileNav({
  links,
  switchHref,
  switchLabel,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  menuLabel,
  logo
}: {
  links: Array<{ href: string; label: string }>;
  switchHref: string;
  switchLabel: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  menuLabel: string;
  logo: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={menuLabel}
        aria-expanded={open}
        className="rounded-lg p-2 transition-colors hover:bg-black/5"
        style={{ color: INK }}
      >
        <Menu className="h-6 w-6" aria-hidden />
      </button>

      {/* Overlay + top drawer */}
      <div
        className="fixed inset-0 z-50 transition-opacity duration-300"
        style={{
          backgroundColor: "rgba(32,30,29,.35)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none"
        }}
        onClick={() => setOpen(false)}
      >
        <div
          className="mx-3 mt-3 rounded-2xl bg-white p-5 shadow-2xl transition-transform duration-300"
          style={{ transform: open ? "translateY(0)" : "translateY(-14px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            {logo}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-lg p-2 transition-colors hover:bg-black/5"
              style={{ color: DIM }}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <nav className="mt-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block border-b py-3.5 text-base font-bold"
                style={{ borderColor: "rgba(32,30,29,.1)", color: INK }}
              >
                {link.label}
              </a>
            ))}
            <a
              href={switchHref}
              className="block py-3.5 text-sm font-bold uppercase tracking-widest"
              style={{ color: ORANGE }}
            >
              {switchLabel}
            </a>
          </nav>

          <div className="mt-2 space-y-2.5">
            <a
              href={primaryHref}
              className="block rounded-full py-3.5 text-center text-sm font-bold text-white"
              style={{ backgroundColor: GREEN }}
            >
              {primaryLabel}
            </a>
            <a
              href={secondaryHref}
              className="block rounded-full border py-3.5 text-center text-sm font-bold"
              style={{ borderColor: "rgba(20,81,44,.4)", color: GREEN }}
            >
              {secondaryLabel}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Layers scrollytelling ─────────────────────────────────────────── */

export interface LayerItem {
  num: string;
  name: string;
  blurb: string;
  panelKicker: string;
  panelTitle: string;
  rows: Array<{ k: string; v: string }>;
  panelNote: string;
}

export function LayersScroller({ layers }: { layers: LayerItem[] }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      if (total <= 0) return;
      const p = Math.min(1, Math.max(0, -r.top / total));
      const idx = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
      setActive((cur) => (cur === idx ? cur : idx));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={trackRef} className="relative mx-auto mt-10 h-[300vh] max-w-6xl px-5 sm:px-10 max-lg:h-auto">
      <div className="sticky top-24 h-[78vh] min-h-[520px] max-lg:static max-lg:h-auto max-lg:min-h-0">
        <div className="grid h-full items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] max-lg:gap-6">
          {/* Layer index list */}
          <div className="space-y-7 max-lg:space-y-4">
            {layers.map((l, i) => (
              <button
                key={l.num}
                type="button"
                onClick={() => setActive(i)}
                className="block w-full text-start transition-opacity duration-300"
                style={{ opacity: active === i ? 1 : 0.45 }}
              >
                <p className="text-xs font-bold tracking-widest" style={{ color: ORANGE }}>
                  {l.num}
                </p>
                <p
                  className="mt-1 text-2xl font-bold [font-family:var(--font-hl-display)] sm:text-3xl"
                  style={{ color: active === i ? INK : DIM }}
                >
                  {l.name}
                </p>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed" style={{ color: DIM }}>
                  {l.blurb}
                </p>
              </button>
            ))}
          </div>

          {/* Swapping panel (desktop) / stacked panels (mobile) */}
          <div className="relative h-[430px] max-lg:hidden">
            {layers.map((l, i) => (
              <LayerPanel key={l.num} layer={l} active={active === i} absolute />
            ))}
          </div>
          <div className="space-y-4 lg:hidden">
            {layers.map((l) => (
              <LayerPanel key={l.num} layer={l} active absolute={false} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LayerPanel({
  layer,
  active,
  absolute
}: {
  layer: LayerItem;
  active: boolean;
  absolute: boolean;
}) {
  return (
    <div
      className={`${absolute ? "absolute inset-0" : ""} rounded-2xl border bg-white p-7 shadow-xl transition-all duration-500 sm:p-9`}
      style={{
        borderColor: "rgba(32,30,29,.08)",
        opacity: active ? 1 : 0,
        transform: active ? "translateY(0) scale(1)" : "translateY(18px) scale(0.985)",
        pointerEvents: active ? "auto" : "none",
        boxShadow: "0 24px 60px -24px rgba(18,52,31,.25)"
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: ORANGE }}>
        {layer.panelKicker}
      </p>
      <p
        className="mt-3 text-2xl font-bold leading-snug [font-family:var(--font-hl-display)] sm:text-[1.7rem]"
        style={{ color: INK }}
      >
        {layer.panelTitle}
      </p>
      <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-6">
        {layer.rows.map((row) => (
          <div key={row.k} className="border-t pt-3" style={{ borderColor: "rgba(32,30,29,.12)" }}>
            <p className="text-xs" style={{ color: DIM }}>
              {row.k}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums [font-family:var(--font-hl-display)]" style={{ color: GREEN }}>
              {row.v}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-7 border-t pt-4 text-sm leading-relaxed" style={{ borderColor: "rgba(32,30,29,.12)", color: DIM }}>
        {layer.panelNote}
      </p>
    </div>
  );
}

/* ── Feature accordion grid ────────────────────────────────────────── */

export interface FeatureItem {
  num: string;
  title: string;
  body: string;
  points: string[];
}

export function FeaturesGrid({ features }: { features: FeatureItem[] }) {
  const [open, setOpen] = useState(-1);

  return (
    <div
      className="mt-14 grid gap-px sm:grid-cols-2 lg:grid-cols-3"
      style={{ backgroundColor: "rgba(32,30,29,.12)" }}
    >
      {features.map((f, i) => {
        const isOpen = open === i;
        return (
          <button
            key={f.num}
            type="button"
            onMouseEnter={() => setOpen(i)}
            onClick={() => setOpen(isOpen ? -1 : i)}
            className="flex flex-col p-7 text-start transition-colors sm:p-8"
            style={{ backgroundColor: isOpen ? "#FFFFFF" : "#F7F7F6" }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-bold tracking-widest" style={{ color: ORANGE }}>
                {f.num}
              </p>
              <span className="text-lg leading-none" style={{ color: DIM }} aria-hidden>
                {isOpen ? "−" : "+"}
              </span>
            </div>
            <h3
              className="mt-3 text-xl font-bold leading-snug [font-family:var(--font-hl-display)]"
              style={{ color: INK }}
            >
              {f.title}
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed" style={{ color: DIM }}>
              {f.body}
            </p>
            <div
              className="overflow-hidden transition-all duration-300"
              style={{ maxHeight: isOpen ? 260 : 0, opacity: isOpen ? 1 : 0 }}
            >
              <ul className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: "rgba(32,30,29,.12)" }}>
                {f.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm" style={{ color: INK }}>
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: GREEN }} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Pricing with currency toggle ──────────────────────────────────── */

export interface PlanItem {
  name: string;
  blurb: string;
  points: string[];
  priceIls: string;
  priceUsd: string;
}

export function PricingPlans({
  plans,
  isHe,
  labels,
  signupHref
}: {
  plans: PlanItem[];
  isHe: boolean;
  labels: { popular: string; perMonth: string; cta: string };
  signupHref: string;
}) {
  const [cur, setCur] = useState<"ils" | "usd">(isHe ? "ils" : "usd");

  const toggle = (value: "ils" | "usd", label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setCur(value)}
      className="rounded-full px-4 py-1.5 text-xs font-bold transition-colors"
      style={
        cur === value
          ? { backgroundColor: INK, color: "#fff" }
          : { backgroundColor: "transparent", color: INK }
      }
    >
      {label}
    </button>
  );

  return (
    <div>
      <div
        className="mx-auto mt-8 flex w-fit items-center gap-1 rounded-full border p-1"
        style={{ borderColor: "rgba(32,30,29,.2)" }}
      >
        {toggle("ils", "₪ ILS")}
        {toggle("usd", "$ USD")}
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-3 md:items-stretch">
        {plans.map((plan, i) => {
          const popular = i === 1;
          return (
            <div
              key={plan.name}
              className="relative flex flex-col rounded-2xl border p-8"
              style={{
                borderColor: popular ? "rgba(32,30,29,.18)" : "rgba(32,30,29,.12)",
                backgroundColor: popular ? "#EAE9E9" : "transparent",
                boxShadow: popular ? "0 18px 44px -18px rgba(18,52,31,.28)" : "none"
              }}
            >
              {popular ? (
                <span
                  className="absolute -top-3 start-8 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white"
                  style={{ backgroundColor: ORANGE }}
                >
                  {labels.popular}
                </span>
              ) : null}
              <h3 className="text-xl font-bold [font-family:var(--font-hl-display)]" style={{ color: INK }}>
                {plan.name}
              </h3>
              <p className="mt-1 text-xs" style={{ color: DIM }}>
                {plan.blurb}
              </p>
              <p className="mt-6 text-4xl font-bold tabular-nums [font-family:var(--font-hl-display)]" style={{ color: INK }}>
                {cur === "ils" ? plan.priceIls : plan.priceUsd}
                <span className="text-sm font-normal" style={{ color: DIM }}>
                  {" "}
                  {labels.perMonth}
                </span>
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm" style={{ color: INK }}>
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: GREEN }} />
                    {p}
                  </li>
                ))}
              </ul>
              <a
                href={signupHref}
                className="mt-8 block rounded-full border py-3 text-center text-sm font-bold transition-transform hover:-translate-y-0.5"
                style={
                  popular
                    ? { backgroundColor: GREEN, borderColor: GREEN, color: "#fff" }
                    : { backgroundColor: "transparent", borderColor: "rgba(32,30,29,.35)", color: INK }
                }
              >
                {labels.cta}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
