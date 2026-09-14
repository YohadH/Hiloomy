"use client";

// "צריך ממך דקה כדי להשלים את היוזמה" — numbered questions, one per missing
// entity. Each opens a SHORTLIST (at most five likely candidates, with the
// reason), a catalogue search, and "none". Never the whole catalogue, never
// dozens of token matches. Every choice is stored as a plan override and
// re-evaluates the initiative at once. Setup — not a management decision.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContextTask, EntityLink, InitiativeMappings, MappingKind } from "@/lib/domain/initiative-reality";
import { MAPPING_KIND_LABEL, NONE_ENTITY_ID } from "@/lib/domain/initiative-reality";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";
interface Found {
  id: string;
  label: string;
  detail?: string;
}

const QUESTION: Record<MappingKind, { he: (title: string) => string; en: (title: string) => string }> = {
  product: { he: () => "אילו מוצרים משתתפים ביוזמה?", en: () => "Which products take part in the initiative?" },
  gift_product: { he: () => "מהו מוצר המתנה?", en: () => "Which product is the gift?" },
  discount: { he: () => "איזה קופון שייך ליוזמה?", en: () => "Which coupon belongs to the initiative?" },
  meta_campaign: { he: () => "איזה קמפיין Meta מריץ את היוזמה?", en: () => "Which Meta campaign runs the initiative?" }
};

export function ContextResolution({ sheetId, initiativeId, initiativeTitle, context, links, discovery, locale, compact = false }: { sheetId: string; initiativeId: string; initiativeTitle: string; context: ContextTask; links: EntityLink[]; discovery: InitiativeMappings["discovery"]; locale: Locale; compact?: boolean }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const fwd = isHe ? "←" : "→";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [openKind, setOpenKind] = useState<MappingKind | null>(null);
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
        setDone(out.reality?.status ? t("נשמר · היוזמה חושבה מחדש", "Saved · initiative re-evaluated") : t("נשמר", "Saved"));
        setPicked({});
        setFound([]);
        setQuery("");
        setOpenKind(null);
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
  const resolved = context.rows.filter((r) => r.action === "none");
  const candidatesOf = useMemo(() => (kind: MappingKind) => links.filter((l) => l.kind === kind && l.state !== "confirmed"), [links]);
  if (!rows.length) return null;
  const critical = rows.filter((r) => r.critical);

  return (
    <div className={cn("space-y-4 rounded-lg border border-warning/40 bg-warning/5", compact ? "p-4" : "p-5 sm:p-6")}>
      <div>
        <p className={cn("font-semibold", compact ? "text-base" : "text-xl")}>{compact ? t("אישור קצר של ההתאמות האוטומטיות", "A short confirmation of the automatic matches") : t("צריך ממך דקה כדי להשלים את היוזמה", "A minute of your time to complete the initiative")}</p>
        <p className="text-sm text-muted-foreground">
          {compact
            ? t("המספרים כבר מחושבים כאומדן; אישור הופך אותם למאומתים.", "The numbers are already computed as estimates; confirming makes them verified.")
            : t(`כדי שאוכל לעקוב אחרי המכירות, המלאי והקמפיין, חסרים לי ${critical.length} דברים:`, `To follow sales, inventory and the campaign, ${critical.length} thing${critical.length === 1 ? " is" : "s are"} missing:`)}
        </p>
      </div>

      <ol className="space-y-2">
        {rows.map((r, idx) => {
          const cands = candidatesOf(r.kind);
          const isOpen = openKind === r.kind;
          const sel = picked[r.kind] ?? new Set<string>();
          const multi = r.kind === "product";
          const disc = discovery[r.kind];
          const toggle = (id: string) => {
            const next = new Set(multi ? sel : []);
            if (sel.has(id)) next.delete(id);
            else next.add(id);
            setPicked({ ...picked, [r.kind]: next });
          };
          const chosen = [...cands.filter((c) => sel.has(c.id)).map((c) => ({ id: c.id, label: c.label, via: c.provenance.rule as string })), ...found.filter((f) => sel.has(f.id)).map((f) => ({ id: f.id, label: f.label, via: "operator_search" }))];
          const cta = r.action === "confirm" ? t("אשר", "Confirm") : r.kind === "discount" ? t("בחר קופון / אין קופון", "Choose coupon / none") : r.kind === "product" ? t("בחר מוצרים", "Choose products") : t("בחר מוצר", "Choose product");
          return (
            <li key={r.kind} className="rounded-md bg-card">
              <button type="button" onClick={() => { setOpenKind(isOpen ? null : r.kind); setFound([]); setQuery(""); }} className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-start">
                <span className="text-base font-medium">
                  {idx + 1}. {QUESTION[r.kind][locale](initiativeTitle)}
                  {!r.critical ? <span className="ms-2 text-xs font-normal text-muted-foreground">{t("לא חובה", "optional")}</span> : null}
                </span>
                <span className="text-sm font-semibold underline-offset-4 hover:underline">{isOpen ? t("סגור", "Close") : `${cta} ${fwd}`}</span>
              </button>

              {isOpen ? (
                <div className="space-y-3 border-t border-border/60 px-3 py-3">
                  {disc?.note ? <p className="text-sm text-warning">{disc.note[locale]}</p> : null}
                  {cands.length ? (
                    <>
                      <p className="text-sm font-medium">{r.action === "confirm" ? t("זוהו אוטומטית — לאישור:", "Auto-matched — to confirm:") : t("מצאתי כמה מועמדים שעשויים להתאים:", "I found a few candidates that may fit:")}</p>
                      <ul className="space-y-1.5 text-sm">
                        {cands.map((c) => (
                          <li key={c.id}>
                            <label className="flex cursor-pointer items-start gap-2">
                              <input type={multi ? "checkbox" : "radio"} name={`pick-${r.kind}`} checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="mt-1" />
                              <span>
                                <span className="font-medium">{c.label}</span>
                                <span className="block text-[11px] text-muted-foreground">{c.reason[locale]}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("לא מצאתי מועמדים בעצמי — חפשו בקטלוג.", "I could not find candidates on my own — search the catalogue.")}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void search(r.kind, query);
                      }}
                      placeholder={r.kind === "discount" ? t("חיפוש קוד קופון…", "Search a coupon code…") : r.kind === "meta_campaign" ? t("חיפוש שם קמפיין…", "Search a campaign name…") : t("חיפוש מוצר", "Search product")}
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
                              {f.detail ? <span className="block text-[11px] text-muted-foreground">{f.detail}</span> : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" disabled={pending || chosen.length === 0} onClick={() => confirm(r.kind, chosen)} className="rounded-md bg-foreground px-4 py-1.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50">
                      {r.kind === "product" ? (chosen.length > 1 ? t(`אשר ${chosen.length} מוצרים`, `Confirm ${chosen.length} products`) : t("אשר מוצר", "Confirm product")) : t("אשר", "Confirm")}
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
      </ol>

      {resolved.length ? (
        <p className="text-sm text-success">
          {resolved.map((r) => `✓ ${MAPPING_KIND_LABEL[r.kind][locale]}`).join(" · ")}
          {context.known.length ? <span className="text-muted-foreground"> · {context.known.filter((k) => !/^Plan window|^חלון התוכנית/.test(k.en)).map((k) => k[locale]).join(" · ")}</span> : null}
        </p>
      ) : null}
      {done ? <p className="text-xs text-success">{done}</p> : null}
      {err ? <p className="text-xs text-danger">{err}</p> : null}
    </div>
  );
}
