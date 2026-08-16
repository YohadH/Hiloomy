"use client";

// Sprint detail board — the live "follow-up" view the operator asked
// for. Three sections:
//   1. Header — name, status badge, stage progress (1/3, 2/3, 3/3)
//   2. Action bar — what to do next based on status
//   3. Stats strip — total/alive/killed/winners
//   4. Matrix grid — one tile per ad with thumb + KPIs + decision log
//
// Polls /api/creative-sprint/{id} every 6s while the sprint is in a
// non-terminal state so the matrix stays fresh during generation /
// publishing / measurement.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { SprintDetail } from "@/lib/services/creative-sprint/sprint-service";
import type { AppLocale } from "@/lib/i18n";
import { PublishTargetingModal } from "./publish-targeting-modal";
import { BriefEditModal } from "./brief-edit-modal";
import { GenerateBriefsModal } from "./generate-briefs-modal";

interface Props {
  initial: SprintDetail;
  locale: AppLocale;
  storeName: string;
  storeCurrency: string;
}

const TERMINAL_STATUSES = new Set(["complete", "cancelled", "failed"]);
const POLL_INTERVAL_MS = 6000;

function statusBadgeClass(status: string): string {
  if (status === "complete") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "winner") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "running" || status === "measuring" || status === "live") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "killed" || status === "cancelled" || status === "failed") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "awaiting_brief_approval" || status === "awaiting_asset_approval") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function formatPct(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function formatMoney(v: string | null | number, currency: string): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function SprintDetailBoard({ initial, locale, storeName, storeCurrency }: Props) {
  const t = locale === "he";
  const router = useRouter();
  const [sprint, setSprint] = useState<SprintDetail>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showGenerateBriefsModal, setShowGenerateBriefsModal] = useState(false);
  // Open ad in the brief-edit modal. Briefs are only editable while the
  // sprint is in brief-approval phase; after that the modal still opens
  // (so the operator can read the full text) but inputs are disabled.
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const briefsEditable = sprint.status === "awaiting_brief_approval";
  const editingAd = editingAdId ? sprint.ads.find((a) => a.id === editingAdId) ?? null : null;

  async function refreshSprint() {
    try {
      const res = await fetch(`/api/creative-sprint/${sprint.id}`);
      const body = await res.json();
      if (body.ok && body.sprint) setSprint(body.sprint as SprintDetail);
    } catch {
      // ignore transient
    }
  }

  // ── Live polling while sprint is non-terminal ──────────────────────
  useEffect(() => {
    if (TERMINAL_STATUSES.has(sprint.status)) return;
    const handle = setInterval(async () => {
      try {
        const res = await fetch(`/api/creative-sprint/${sprint.id}`);
        const body = await res.json();
        if (body.ok && body.sprint) setSprint(body.sprint as SprintDetail);
      } catch {
        // ignore transient errors
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [sprint.id, sprint.status]);

  // ── Summary stats ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    let alive = 0, killed = 0, winner = 0, ready = 0, generating = 0, failed = 0;
    for (const a of sprint.ads) {
      if (a.finalStatus === "alive") alive++;
      else if (a.finalStatus === "killed") killed++;
      else if (a.finalStatus === "winner") winner++;
      if (a.status === "asset_ready" || a.status === "brief_ready") ready++;
      else if (a.status === "generating" || a.status === "publishing") generating++;
      else if (a.status === "failed") failed++;
    }
    return { alive, killed, winner, ready, generating, failed, total: sprint.ads.length };
  }, [sprint.ads]);

  // ── Action handlers ───────────────────────────────────────────────
  async function callAction(label: string, path: string, body?: unknown): Promise<void> {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      router.refresh();
      // pull fresh state
      const res2 = await fetch(`/api/creative-sprint/${sprint.id}`);
      const j2 = await res2.json();
      if (j2.ok && j2.sprint) setSprint(j2.sprint as SprintDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function onGenerateBriefs() {
    // Open the rich modal that lets the operator pick a real product
    // from the store catalog + an optional campaign vibe. The modal
    // itself fires the API call and refreshes state on success.
    setShowGenerateBriefsModal(true);
  }

  // ── Action bar — what's next based on status ──────────────────────
  function renderActionBar() {
    const actions: React.ReactNode[] = [];
    const s = sprint.status;
    if (s === "draft") {
      actions.push(
        <Button key="g" onClick={onGenerateBriefs} disabled={busy !== null}>
          {busy === "briefs" ? (t ? "מייצר תקצירים…" : "Generating briefs…") : (t ? "צרו 100 תקצירים" : "Generate briefs")}
        </Button>
      );
    }
    if (s === "awaiting_brief_approval") {
      actions.push(
        <Button key="ab" onClick={() => callAction("approve-briefs", `/api/creative-sprint/${sprint.id}/approve-briefs`)} disabled={busy !== null}>
          {busy === "approve-briefs" ? "…" : (t ? "אישור והמשך לנכסים" : "Approve & generate assets")}
        </Button>
      );
    }
    if (s === "generating_assets") {
      actions.push(
        <Button key="ga" onClick={() => callAction("assets", `/api/creative-sprint/${sprint.id}/generate-assets`)} disabled={busy !== null}>
          {busy === "assets" ? (t ? "מייצר נכסים…" : "Generating assets…") : (t ? "התחילו ייצור נכסים" : "Start asset generation")}
        </Button>
      );
    }
    if (s === "awaiting_asset_approval") {
      actions.push(
        <Button key="aa" onClick={() => callAction("approve-assets", `/api/creative-sprint/${sprint.id}/approve-assets`)} disabled={busy !== null}>
          {busy === "approve-assets" ? "…" : (t ? "אישור נכסים" : "Approve assets")}
        </Button>
      );
      actions.push(
        <Button key="pub" variant="secondary" onClick={() => setShowPublishModal(true)} disabled={busy !== null}>
          {t ? "הגדירו ופרסמו" : "Configure & publish"}
        </Button>
      );
    }
    if (s === "running" || s === "measuring") {
      actions.push(
        <Button key="e1" variant="secondary" onClick={() => callAction("eval-1", `/api/creative-sprint/${sprint.id}/evaluate?stage=1`)} disabled={busy !== null}>
          {t ? "הערכה ידנית שלב 1" : "Evaluate stage 1"}
        </Button>
      );
      actions.push(
        <Button key="e2" variant="secondary" onClick={() => callAction("eval-2", `/api/creative-sprint/${sprint.id}/evaluate?stage=2`)} disabled={busy !== null}>
          {t ? "הערכה ידנית שלב 2" : "Evaluate stage 2"}
        </Button>
      );
      actions.push(
        <Button key="e3" variant="secondary" onClick={() => callAction("eval-3", `/api/creative-sprint/${sprint.id}/evaluate?stage=3`)} disabled={busy !== null}>
          {t ? "הערכה ידנית שלב 3" : "Evaluate stage 3"}
        </Button>
      );
    }
    if (!TERMINAL_STATUSES.has(s)) {
      actions.push(
        <Button
          key="cancel"
          variant="ghost"
          className="text-rose-600"
          onClick={() => {
            if (!confirm(t ? "לבטל את הספרינט ולעצור את כל המודעות?" : "Cancel sprint and pause all ads?")) return;
            callAction("cancel", `/api/creative-sprint/${sprint.id}/cancel`);
          }}
          disabled={busy !== null}
        >
          {t ? "ביטול ועצירת כל המודעות" : "Cancel & pause all"}
        </Button>
      );
    }
    return actions;
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Creative Sprint</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{sprint.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(sprint.status)}`}>
              {sprint.status}
            </span>
            <span className="text-muted-foreground">
              {t ? "שלב" : "Stage"} {sprint.currentStage} / {sprint.cascade.length}
            </span>
            {sprint.publishedAt ? (
              <span className="text-muted-foreground">
                {t ? "פורסם" : "Published"}: {new Date(sprint.publishedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{renderActionBar()}</div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label={t ? "סה״כ מודעות" : "Total ads"} value={stats.total} tone="neutral" />
        <Stat label={t ? "פעילות" : "Alive"} value={stats.alive} tone="sky" />
        <Stat label={t ? "נעצרו" : "Killed"} value={stats.killed} tone="rose" />
        <Stat label={t ? "מנצחות" : "Winners"} value={stats.winner} tone="emerald" />
        <Stat label={t ? "מוכנות לפרסום" : "Ready"} value={stats.ready} tone="amber" />
        <Stat label={t ? "בייצור" : "Generating"} value={stats.generating} tone="neutral" />
        <Stat label={t ? "נכשלו" : "Failed"} value={stats.failed} tone="rose" />
      </div>

      {/* ── Matrix grid ─────────────────────────────────────────── */}
      {sprint.ads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-12 text-center text-sm text-muted-foreground">
          {t ? "תקצירים יופיעו כאן ברגע שתייצרו אותם." : "Briefs will appear here once you generate them."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10">
          {sprint.ads.map((ad) => (
            <AdTile
              key={ad.id}
              ad={ad}
              locale={locale}
              storeCurrency={storeCurrency}
              onClick={() => setEditingAdId(ad.id)}
            />
          ))}
        </div>
      )}

      {/* ── Cost summary ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CostCard
          label={t ? "אומדן Higgsfield" : "Higgsfield estimate"}
          value={sprint.estimatedHiggsfieldUsd ? `$${Number(sprint.estimatedHiggsfieldUsd).toFixed(2)}` : "—"}
        />
        <CostCard
          label={t ? "Higgsfield בפועל" : "Higgsfield actual"}
          value={sprint.actualHiggsfieldUsd ? `$${Number(sprint.actualHiggsfieldUsd).toFixed(2)}` : "—"}
        />
        <CostCard
          label={t ? "תקציב פרסום (תקרה)" : "Ad spend ceiling"}
          value={sprint.estimatedAdSpend ? `${storeCurrency} ${Number(sprint.estimatedAdSpend).toLocaleString()}` : "—"}
        />
        <CostCard
          label={t ? "תקציב פרסום בפועל" : "Ad spend actual"}
          value={sprint.actualAdSpend ? `${storeCurrency} ${Number(sprint.actualAdSpend).toLocaleString()}` : "—"}
        />
      </div>

      {showPublishModal ? (
        <PublishTargetingModal
          sprintId={sprint.id}
          locale={locale}
          onClose={() => setShowPublishModal(false)}
          onPublished={() => {
            setShowPublishModal(false);
            router.refresh();
          }}
        />
      ) : null}

      {editingAd ? (
        <BriefEditModal
          sprintId={sprint.id}
          ad={editingAd}
          locale={locale}
          editable={briefsEditable}
          onClose={() => setEditingAdId(null)}
          onSaved={async () => {
            await refreshSprint();
            setEditingAdId(null);
          }}
        />
      ) : null}

      {showGenerateBriefsModal ? (
        <GenerateBriefsModal
          sprintId={sprint.id}
          storeName={storeName}
          locale={locale}
          onClose={() => setShowGenerateBriefsModal(false)}
          onGenerated={async () => {
            setShowGenerateBriefsModal(false);
            await refreshSprint();
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

// ── Small subcomponents ───────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "sky" | "rose" | "emerald" | "amber" }) {
  const toneClass = {
    neutral: "text-foreground",
    sky: "text-sky-700",
    rose: "text-rose-600",
    emerald: "text-emerald-700",
    amber: "text-amber-700"
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function CostCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function statusTone(status: string, finalStatus: string): string {
  if (finalStatus === "winner") return "ring-2 ring-emerald-300 bg-emerald-50/40";
  if (finalStatus === "killed") return "opacity-60 grayscale";
  if (status === "failed") return "ring-2 ring-rose-300 bg-rose-50/30 opacity-70";
  return "";
}

function AdTile({
  ad,
  locale,
  storeCurrency,
  onClick
}: {
  ad: SprintDetail["ads"][number];
  locale: AppLocale;
  storeCurrency: string;
  onClick?: () => void;
}) {
  const t = locale === "he";
  // Asset URL is resolved server-side (presigned R2 URL or local proxy
  // path depending on backend). The old code hardcoded /api/creative/files
  // which only worked locally — broken in prod where storage is R2.
  const thumbSrc = ad.assetUrl ?? null;
  const isVideo = (ad.assetMimeType || "").startsWith("video/");

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group block overflow-hidden rounded-xl border border-border bg-card text-start shadow-soft transition hover:border-foreground/30 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary ${statusTone(ad.status, ad.finalStatus)}`}
      title={t ? "לחצו לצפייה ולעריכת התקציר" : "Click to view / edit brief"}
    >
      <div className="relative aspect-[9/16] w-full bg-muted">
        {thumbSrc ? (
          isVideo ? (
            <video src={thumbSrc} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <Image src={thumbSrc} alt={`Slot ${ad.slotIndex}`} fill className="object-cover" sizes="200px" unoptimized />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            #{ad.slotIndex}
          </div>
        )}
        <div className="absolute top-1 start-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          #{ad.slotIndex}
        </div>
        {ad.finalStatus === "winner" ? (
          <div className="absolute end-1 top-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {t ? "מנצחת" : "WIN"}
          </div>
        ) : ad.finalStatus === "killed" ? (
          <div className="absolute end-1 top-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {t ? "נעצרה" : "KILL"}
          </div>
        ) : null}
      </div>
      <div className="space-y-1 px-2 py-2 text-[11px]">
        <p className="truncate font-medium" title={ad.headline}>{ad.headline || ad.angle}</p>
        <p className="text-muted-foreground">{ad.angle}</p>
        {ad.lastImpressions > 0 ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 tabular-nums text-muted-foreground">
            <span>{t ? "חשיפות" : "Imps"}: {ad.lastImpressions.toLocaleString()}</span>
            <span>CTR: {formatPct(ad.lastCtr)}</span>
            <span>CPC: {formatMoney(ad.lastCpc, storeCurrency)}</span>
            <span>{t ? "רכישות" : "Purchases"}: {ad.lastPurchases}</span>
            <span className="col-span-2">CPA: {formatMoney(ad.lastCpa, storeCurrency)}</span>
          </div>
        ) : null}
        {ad.killedReason ? (
          <p className="truncate text-[10px] text-rose-600" title={ad.killedReason}>
            {t ? "סיבה" : "Reason"}: {ad.killedReason}
          </p>
        ) : null}
        {ad.errorMessage ? (
          <p className="truncate text-[10px] text-rose-600" title={ad.errorMessage}>
            {ad.errorMessage}
          </p>
        ) : null}
      </div>
    </button>
  );
}
