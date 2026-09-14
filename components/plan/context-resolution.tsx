"use client";

// The resolution flow: for each entity the initiative needs, show the
// candidates Hiloomy found (with the reason), let the operator pick one or
// several, search the catalogue, or say "not a Shopify product". Every
// choice is stored as a plan override and re-evaluates the initiative at
// once (the overrides route recomputes). Setup — not a management decision.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContextTask, EntityLink, MappingKind } from "@/lib/domain/initiative-reality";
import { MAPPING_KIND_LABEL, NONE_ENTITY_ID } from "@/lib/domain/initiative-reality";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";
interface Found {
  id: string;
  label: string;
  detail?: string;
}

const QUESTION: Record<MappingKind, { he: (title: string) => string; en: (title: string) => string }> = {
  product: { he: (t) => `אילו מוצרים שייכים ל"${t}"?`, en: (t) => `Which products belong to "${t}"?` },
  gift_product: { he: () => "איזה מוצר הוא המתנה?", en: () => "Which product is the gift?" },
  discount: { he: () => "איזה קופון שייך ליוזמה?", en: () => "Which coupon belongs to this initiative?" },
  meta_campaign: { he: () => "איזה קמפיין Meta מריץ את היוזמה?", en: () => "Which Meta campaign runs this initiative?" }
};

export function ContextResolution({ sheetId, initiativeId, initiativeTitle, context, links, locale }: { sheetId: string; initiativeId: string; initiativeTitle: string; context: ContextTask; links: EntityLink[]; locale: Locale }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [openKind, setOpenKind] = useState<MappingKind | null>(context.rows.find((r) => r.action !== "none")?.kind ?? null);
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const post = async (ops: Array<Record<string, unknown>>) => {
    setErr(null);
    let last: { reality?: { status?: string } | null } = {};
    for (const op of ops) {
      const res = await fetch(`/api/gantt/${sheetId}/plan/overrides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reality?: { status?: string } | null };
      if (!res.ok || !body.ok) throw new Error(body?.error ?? "failed");
      last = body;
    }
    return last;
  };
  const confirm = (kind: MappingKind, items: Array<{ id: string; label: string; via: string | null }>) =>
    start(async () => {
      try {
        const out = await post(items.map((i) => ({ op: "link_entity", initiativeId, kind, id: i.id, label: i.label, via: i.via })));
        setDone(out.reality?.status ? t(`נשמר · היוזמה חושבה מחדש (${out.reality.status})`, `Saved · initiative re-evaluated (${out.reality.status})`) : t("נשמר", "Saved"));
        setPicked({});
        setFound([]);
        setQuery("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  const search = async (kind: MappingKind, q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/gantt/${sheetId}/plan/entity-search?kind=${kind}&q=${encodeURIComponent(q)}`);
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; results?: Found[] };
      setFound(body.results ?? []);
    } finally {
      setSearching(false);
    }
  };

  const rows = context.rows.filter((r) => r.action !== "none");
  const candidatesOf = useMemo(() => (kind: MappingKind) => links.filter((l) => l.kind === kind && l.state !== "confirmed"), [links]);
  if (!rows.length) return null;

  return (
    <div className="space-y-4 rounded-lg border border-warning/40 bg-warning/5 p-4 sm:p-5">
      <div>
        <p className="text-lg font-semibold">{t("Hiloomy צריכה השלמה קצרה", "Hiloomy needs a short completion")}</p>
        <p className="text-sm text-muted-foreground">{t("כדי לחשב את המכירות, המלאי והרווחיות של היוזמה, צריך לחבר את הישויות הבאות. זו הגדרה — לא החלטה ניהולית.", "To compute the initiative's sales, inventory and profitability, connect the following entities. This is setup — not a management decision.")}</p>
        {context.known.length ? <p className="mt-1 text-xs text-success">{context.known.map((k) => `✓ ${k[locale]}`).join(" · ")}</p> : null}
      </div>

      <ul className="divide-y divide-border/60">
        {rows.map((r) => {
          const cands = candidatesOf(r.kind);
          const isOpen = openKind === r.kind;
          const sel = picked[r.kind] ?? new Set<string>();
          const multi = r.kind === "product";
          const toggle = (id: string) => {
            const next = new Set(multi ? sel : []);
            if (sel.has(id)) next.delete(id);
            else next.add(id);
            setPicked({ ...picked, [r.kind]: next });
          };
          const chosen = [...cands.filter((c) => sel.has(c.id)).map((c) => ({ id: c.id, label: c.label, via: c.provenance.rule as string })), ...found.filter((f) => sel.has(f.id)).map((f) => ({ id: f.id, label: f.label, via: "operator_search" }))];
          return (
            <li key={r.kind} className="py-3">
              <button type="button" onClick={() => setOpenKind(isOpen ? null : r.kind)} className="flex w-full flex-wrap items-center justify-between gap-2 text-start">
                <span>
                  <span className={cn("font-semibold", r.critical ? "text-warning" : "")}>
                    {r.critical ? "⚠ " : "○ "}
                    {MAPPING_KIND_LABEL[r.kind][locale]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {" · "}
                    {r.action === "confirm" ? t(`${r.provisional} זוהו אוטומטית — לאישור`, `${r.provisional} auto-matched — to confirm`) : r.action === "choose" ? t(`${r.candidates} הצעות נמצאו`, `${r.candidates} suggestions found`) : t("אין התאמה בטוחה — חיפוש", "no confident match — search")}
                    {!r.critical ? ` · ${t("לא חובה", "optional")}` : ""}
                  </span>
                  <span className="block text-xs text-muted-foreground">{r.why[locale]}</span>
                </span>
                <span className="text-xs font-semibold underline-offset-4 hover:underline">{isOpen ? t("סגור", "Close") : r.action === "confirm" ? t("אשר", "Confirm") : r.action === "choose" ? t("בחר", "Choose") : t("חפש", "Search")}</span>
              </button>

              {isOpen ? (
                <div className="mt-3 space-y-3 rounded-md bg-card p-3">
                  <p className="text-sm font-medium">{QUESTION[r.kind][locale](initiativeTitle)}</p>
                  {cands.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {cands.map((c) => (
                        <li key={c.id}>
                          <label className="flex cursor-pointer items-start gap-2">
                            <input type={multi ? "checkbox" : "radio"} name={`pick-${r.kind}`} checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="mt-1" />
                            <span>
                              <span className="font-medium">{c.label}</span>
                              <span className={cn("ms-2 rounded px-1.5 py-0.5 text-[11px]", c.state === "provisional" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{c.state === "provisional" ? t("זוהה אוטומטית", "auto-matched") : t("הצעה", "suggested")}</span>
                              <span className="block text-xs text-muted-foreground">{c.reason[locale]}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("לא נמצאו מועמדים אוטומטית.", "No candidates were found automatically.")}</p>
                  )}

                  {/* Search another entity */}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void search(r.kind, query);
                      }}
                      placeholder={r.kind === "discount" ? t("חפש קוד קופון…", "Search a coupon code…") : r.kind === "meta_campaign" ? t("חפש שם קמפיין…", "Search a campaign name…") : t("חפש מוצר בקטלוג…", "Search the catalogue…")}
                      className="h-9 min-w-56 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                    />
                    <button type="button" disabled={searching || query.trim().length < 2} onClick={() => void search(r.kind, query)} className="h-9 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-50">
                      {searching ? t("מחפש…", "Searching…") : t("חפש", "Search")}
                    </button>
                  </div>
                  {found.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {found.map((f) => (
                        <li key={f.id}>
                          <label className="flex cursor-pointer items-start gap-2">
                            <input type={multi ? "checkbox" : "radio"} name={`pick-${r.kind}`} checked={sel.has(f.id)} onChange={() => toggle(f.id)} className="mt-1" />
                            <span>
                              <span className="font-medium">{f.label}</span>
                              {f.detail ? <span className="block text-xs text-muted-foreground">{f.detail}</span> : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" disabled={pending || chosen.length === 0} onClick={() => confirm(r.kind, chosen)} className="rounded-md bg-foreground px-4 py-1.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50">
                      {r.kind === "product" ? t("אשר מוצרים", "Confirm products") : t("אשר", "Confirm")}
                      {chosen.length > 1 ? ` (${chosen.length})` : ""}
                    </button>
                    {r.kind === "gift_product" || r.kind === "discount" ? (
                      <button type="button" disabled={pending} onClick={() => confirm(r.kind, [{ id: NONE_ENTITY_ID, label: r.kind === "gift_product" ? t("לא מוצר Shopify", "Not a Shopify product") : t("אין קופון", "No coupon"), via: null }])} className="text-sm text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50">
                        {r.kind === "gift_product" ? t("המתנה אינה מוצר ב-Shopify", "The gift is not a Shopify product") : t("אין קופון ליוזמה", "No coupon for this initiative")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {done ? <p className="text-xs text-success">{done}</p> : null}
      {err ? <p className="text-xs text-danger">{err}</p> : null}
    </div>
  );
}
