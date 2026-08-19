"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

// Integrations hub — Lebesgue-style connector grid in Hiloomy's brand.
// Each integration is a compact tile (logo, status pill, one-liner,
// connect button). Clicking a tile opens its full connection manager —
// the existing manager components are passed in from the server page as
// ReactNode panels, so no connection logic lives here.

export type IntegrationStatus = "connected" | "not_connected" | "attention" | "soon";

export interface IntegrationItem {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  /** Category header the tile is grouped under (Triple Whale-style). */
  category: string;
  /** Small extra label under the pill, e.g. shop domain or "required". */
  meta?: string | null;
  required?: boolean;
}

const GLYPH_BOX = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-black/5 shadow-sm";

/** Simplified brand glyphs — inline so no external assets are needed. */
function IntegrationGlyph({ id }: { id: string }) {
  switch (id) {
    case "shopify":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <path
              d="M15.4 5.1c-.1 0-.3.1-.4.1-.1-.4-.3-.8-.6-1.2-.5-.6-1.1-.9-1.8-.9-.1 0-.2 0-.3 0-.5-.6-1-.9-1.6-.9C9.3 2.2 8.2 3.3 7.5 5c-.5 1.1-.8 2.5-.9 3.5-1.3.4-2.2.7-2.3.7-.7.2-.7.2-.8.9C3.4 10.6 2 21.3 2 21.3l13.9 2.6V5.1c-.2 0-.4 0-.5 0zm-2.3.7c-.7.2-1.5.5-2.3.7.2-.9.7-1.8 1.2-2.4.2-.2.5-.5.8-.6.3.7.4 1.6.3 2.3zM11 2.9c.3 0 .5.1.7.2-.3.2-.6.4-.9.8-.7.8-1.2 2-1.4 3.1-.7.2-1.3.4-1.9.6C7.9 5.8 9.3 3 11 2.9zm-2.1 9.6c.1 1.2 3.3 1.5 3.5 4.4.1 2.3-1.2 3.8-3.2 4-2.3.1-3.6-1.2-3.6-1.2l.5-2.1s1.3 1 2.3.9c.7 0 .9-.6.9-1-.1-1.6-2.7-1.5-2.9-4.1-.1-2.2 1.3-4.5 4.6-4.7 1.3-.1 1.9.2 1.9.2l-.7 2.8s-.8-.4-1.8-.3c-1.4.1-1.5.9-1.5 1.1zm7.5-7.3v18.5l3.6-.9s-1.5-10-1.5-10.1c0-.1-.1-.1-.2-.1s-1.1 0-1.1 0-.6-.6-.8-.8V5.2z"
              fill="#16A34A"
            />
          </svg>
        </span>
      );
    case "meta":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <path
              d="M6.9 6.5C4.2 6.5 2 10 2 13.6c0 2.3 1.1 3.9 3 3.9 1.4 0 2.4-.7 4.2-3.7 0 0 .8-1.3 1.3-2.2.2.3.4.6.6 1l.9 1.5c1.7 2.9 2.7 3.4 4.1 3.4 1.9 0 3-1.6 3-4C19 9.8 16.8 6.5 14 6.5c-1.5 0-2.7.9-3.9 2.4C8.9 7.3 7.9 6.5 6.9 6.5zm7 2.2c1.7 0 3.2 2.6 3.2 4.9 0 1.2-.4 1.9-1.2 1.9-.8 0-1.2-.5-2.7-3l-.7-1.2c-.2-.4-.5-.8-.7-1.1.9-1.1 1.5-1.5 2.1-1.5zM6.9 8.6c.6 0 1.2.4 2.2 1.7-.4.6-.8 1.3-1.2 2l-.5.8c-1.2 2-1.7 2.4-2.3 2.4-.7 0-1.1-.6-1.1-1.8 0-2.5 1.4-5.1 2.9-5.1z"
              fill="#0081FB"
            />
          </svg>
        </span>
      );
    case "instagram":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <defs>
              <linearGradient id="hl-ig" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#FFD600" />
                <stop offset="35%" stopColor="#FF4D67" />
                <stop offset="100%" stopColor="#B036CE" />
              </linearGradient>
            </defs>
            <rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="url(#hl-ig)" strokeWidth="2.1" />
            <circle cx="12" cy="12" r="4.2" fill="none" stroke="url(#hl-ig)" strokeWidth="2.1" />
            <circle cx="17.2" cy="6.8" r="1.3" fill="url(#hl-ig)" />
          </svg>
        </span>
      );
    case "google":
    case "gsc":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" fill="#4285F4" />
            <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.7 19.8 8.1 22 12 22z" fill="#34A853" />
            <path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1C2.4 8.8 2 10.4 2 12s.4 3.2 1.1 4.6L6.4 14z" fill="#FBBC05" />
            <path d="M12 5.9c1.5 0 2.8.5 3.8 1.5L18.7 5C17 3.4 14.7 2 12 2 8.1 2 4.7 4.2 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" fill="#EA4335" />
          </svg>
        </span>
      );
    case "bixgrow":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <path
              d="M10.6 13.4a4 4 0 0 0 5.7 0l3.5-3.5a4 4 0 1 0-5.7-5.7l-1.6 1.6"
              fill="none" stroke="#F97316" strokeWidth="2.2" strokeLinecap="round"
            />
            <path
              d="M13.4 10.6a4 4 0 0 0-5.7 0l-3.5 3.5a4 4 0 1 0 5.7 5.7l1.6-1.6"
              fill="none" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round"
            />
          </svg>
        </span>
      );
    case "tiktok":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <path
              d="M16.9 2h-3.2v13.7a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.6a6.2 6.2 0 0 0-.9-.1 6.2 6.2 0 1 0 6.2 6.2V8.6a7.7 7.7 0 0 0 4.4 1.4V6.8A4.6 4.6 0 0 1 16.9 2z"
              fill="#111"
            />
          </svg>
        </span>
      );
    case "googleads":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <rect x="9.4" y="3.5" width="5.2" height="15" rx="2.6" transform="rotate(30 12 11)" fill="#4285F4" />
            <rect x="9.4" y="3.5" width="5.2" height="15" rx="2.6" transform="rotate(-30 12 11)" fill="#FBBC05" />
            <circle cx="6" cy="18.2" r="2.7" fill="#34A853" />
          </svg>
        </span>
      );
    case "humanz":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="5" fill="#12123B" />
            <path d="M8 7.5v9M16 7.5v9M8 12h8" stroke="#3EF0C0" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "flashy":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="5" fill="#2563EB" />
            <path d="M13.2 4.8 7.6 13h3.6l-1 6.2 6.2-8.6h-3.8l.6-5.8z" fill="#FDE047" />
          </svg>
        </span>
      );
    case "sheets":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <rect x="5" y="2.5" width="14" height="19" rx="2" fill="#0F9D58" />
            <rect x="8" y="9" width="8" height="1.6" fill="#fff" />
            <rect x="8" y="12.2" width="8" height="1.6" fill="#fff" />
            <rect x="8" y="15.4" width="8" height="1.6" fill="#fff" />
            <rect x="11.2" y="9" width="1.6" height="8" fill="#fff" />
          </svg>
        </span>
      );
    case "ga4":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <rect x="15.5" y="3" width="5" height="18" rx="2.5" fill="#F9AB00" />
            <rect x="9.5" y="9" width="5" height="12" rx="2.5" fill="#E37400" />
            <circle cx="6" cy="18.5" r="2.5" fill="#E37400" />
          </svg>
        </span>
      );
    case "klaviyo":
      return (
        <span className={GLYPH_BOX}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <path d="M4 4h16v16H4z" fill="#111" />
            <path d="M4 4h16L13.5 12 20 20H4V4z" fill="#fff" opacity=".15" />
            <path d="M7 7h2.6v4.2L13.4 7h3.2l-4.4 4.9L17 17h-3.3l-4.1-4.6V17H7V7z" fill="#fff" />
          </svg>
        </span>
      );
    default:
      return (
        <span className={GLYPH_BOX}>
          <Plug className="h-5 w-5 text-muted-foreground" aria-hidden />
        </span>
      );
  }
}

function StatusPill({ status, isHe }: { status: IntegrationStatus; isHe: boolean }) {
  const map: Record<IntegrationStatus, { label: string; cls: string }> = {
    connected: {
      label: isHe ? "מחובר" : "CONNECTED",
      cls: "border-green-300 bg-green-50 text-green-700"
    },
    not_connected: {
      label: isHe ? "לא מחובר" : "NOT CONNECTED",
      cls: "border-rose-300 bg-rose-50 text-rose-600"
    },
    attention: {
      label: isHe ? "דורש בדיקה" : "NEEDS ATTENTION",
      cls: "border-amber-300 bg-amber-50 text-amber-700"
    },
    soon: {
      label: isHe ? "בקרוב" : "COMING SOON",
      cls: "border-border bg-muted text-muted-foreground"
    }
  };
  const { label, cls } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
        cls
      )}
    >
      {label}
    </span>
  );
}

export function IntegrationsHub({
  isHe,
  items,
  panels,
  initialOpen,
  requestEmail
}: {
  isHe: boolean;
  items: IntegrationItem[];
  /** Full connection-manager UIs, keyed by integration id (server-rendered). */
  panels: Record<string, ReactNode>;
  initialOpen?: string | null;
  /** When set, renders a "Request integration" tile that opens a mailto. */
  requestEmail?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const open = useCallback((id: string) => {
    setOpenId((current) => (current === id ? null : id));
  }, []);

  const openItem = openId ? items.find((i) => i.id === openId) : null;

  // Modal plumbing: lock body scroll and close on Escape while open.
  useEffect(() => {
    document.body.style.overflow = openItem ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    if (openItem) window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [openItem]);

  return (
    <div className="space-y-4">
      {Array.from(new Set(items.map((i) => i.category))).map((category, catIdx, cats) => (
        <div key={category} className="space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {category}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items
              .filter((i) => i.category === category)
              .map((item) => {
          const isOpen = openId === item.id;
          const clickable = item.status !== "soon" && panels[item.id];
          return (
            <div
              key={item.id}
              className={cn(
                "flex flex-col rounded-2xl border bg-card p-4 transition-all",
                isOpen
                  ? "border-green-400 shadow-md ring-1 ring-green-200"
                  : "border-border shadow-sm",
                item.status === "soon" && "opacity-70"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <IntegrationGlyph id={item.id} />
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => open(item.id)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5",
                      item.status === "connected"
                        ? "bg-primary"
                        : "bg-[#F97316]"
                    )}
                  >
                    {isOpen
                      ? isHe ? "סגירה" : "Close"
                      : item.status === "connected"
                        ? isHe ? "ניהול" : "Manage"
                        : isHe ? "חיבור" : "Connect Now"}
                  </button>
                ) : (
                  <span className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground">
                    {isHe ? "בקרוב" : "Soon"}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <p className="text-sm font-bold">{item.name}</p>
                {item.required && item.status !== "connected" ? (
                  <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-700">
                    {isHe ? "חובה" : "Required"}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5">
                <StatusPill status={item.status} isHe={isHe} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
              {item.meta ? (
                <p className="mt-1 truncate text-[11px] font-medium text-green-700" dir="ltr">
                  {item.meta}
                </p>
              ) : null}
            </div>
          );
        })}

            {catIdx === cats.length - 1 && requestEmail ? (
          <div className="flex flex-col justify-between rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div>
              <p className="text-sm font-bold text-amber-900">
                {isHe ? "חסרה לכם אינטגרציה?" : "Request integration"}
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-800/80">
                {isHe
                  ? "ספרו לנו איזה חיבור יעזור לכם הכי הרבה — אנחנו בונים לפי ביקוש."
                  : "Tell us which connection would help you most — we build by demand."}
              </p>
            </div>
            <a
              href={`mailto:${requestEmail}?subject=${encodeURIComponent(
                isHe ? "בקשת אינטגרציה לHiloomy" : "Hiloomy integration request"
              )}`}
              className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"
            >
              {isHe ? "שליחת בקשה ←" : "Request now →"}
            </a>
          </div>
        ) : null}
          </div>
        </div>
      ))}

      {/* Detail modal — the full connection manager for the open tile,
          portaled to <body> so page layout/stacking can't clip it. */}
      {mounted && openItem && panels[openItem.id]
        ? createPortal(
            <div
              dir={isHe ? "rtl" : "ltr"}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
              onClick={() => setOpenId(null)}
              role="dialog"
              aria-modal="true"
              aria-label={openItem.name}
            >
              <div
                className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl bg-card shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <IntegrationGlyph id={openItem.id} />
                    <div>
                      <p className="text-sm font-bold">{openItem.name}</p>
                      <StatusPill status={openItem.status} isHe={isHe} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenId(null)}
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={isHe ? "סגירה" : "Close"}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{panels[openItem.id]}</div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
