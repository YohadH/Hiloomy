"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, AlertTriangle, ImageOff, Loader2, Clock, Pencil, Archive, Send, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";
import type { CreativeProjectDetail } from "@/lib/domain/creative-types";
import { PublishToShopifyDialog } from "@/components/creative/publish-to-shopify-dialog";

type JobProgress = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  targetCount: number;
  succeededCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

const POLL_MS_ACTIVE = 2000;
const POLL_MS_IDLE = 0; // 0 = don't poll

function pollIntervalFor(project: CreativeProjectDetail, jobs: JobProgress[]): number {
  if (project.status === "generating") return POLL_MS_ACTIVE;
  if (jobs.some((j) => j.status === "queued" || j.status === "running")) return POLL_MS_ACTIVE;
  if (project.assets.some((a) => a.status === "pending" || a.status === "rendering")) {
    return POLL_MS_ACTIVE;
  }
  return POLL_MS_IDLE;
}

export function CreativeProjectDetailView({
  project: initialProject,
  locale
}: {
  project: CreativeProjectDetail;
  locale: AppLocale;
}) {
  const isHe = locale === "he";
  const [project, setProject] = useState<CreativeProjectDetail>(initialProject);
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [publishingAssetId, setPublishingAssetId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [projectResp, jobsResp] = await Promise.all([
        fetch(`/api/creative/projects/${initialProject.id}`, { cache: "no-store" }),
        fetch(`/api/creative/projects/${initialProject.id}/jobs`, { cache: "no-store" })
      ]);
      if (projectResp.ok) {
        const body = await projectResp.json();
        if (body?.ok && body.project) setProject(body.project);
      }
      if (jobsResp.ok) {
        const body = await jobsResp.json();
        if (body?.ok && Array.isArray(body.jobs)) setJobs(body.jobs);
      }
    } catch {
      /* swallow — next tick will retry */
    }
  }, [initialProject.id]);

  // Initial jobs fetch so we know about queued work even on a static load.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Active-polling loop. Re-runs whenever the interval changes (e.g. when a
  // batch finishes the project flips back to "ready" and we stop polling).
  useEffect(() => {
    const interval = pollIntervalFor(project, jobs);
    if (interval === 0) return;
    const handle = setInterval(refresh, interval);
    return () => clearInterval(handle);
  }, [project, jobs, refresh]);

  const activeJob = useMemo(
    () => jobs.find((j) => j.status === "queued" || j.status === "running") ?? null,
    [jobs]
  );
  const lastFinishedJob = useMemo(
    () => jobs.find((j) => j.status === "succeeded" || j.status === "failed") ?? null,
    [jobs]
  );

  const failedAssets = useMemo(
    () => project.assets.filter((a) => a.status === "failed"),
    [project.assets]
  );

  const retryAsset = useCallback(
    async (assetId: string) => {
      if (retryingId) return;
      setRetryingId(assetId);
      try {
        await fetch(`/api/creative/projects/${project.id}/assets/${assetId}/retry`, {
          method: "POST"
        });
        // Don't try to inspect the response — the polling loop pulls the
        // updated row in a second anyway, and we want the same UX whether
        // the retry succeeds or fails (errors land back in the panel).
        await refresh();
      } catch {
        /* polling will pick it up */
      } finally {
        setRetryingId(null);
      }
    },
    [project.id, refresh, retryingId]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={"/creative" as any}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className={cn("h-4 w-4", isHe ? "rotate-180" : "")} aria-hidden />
          {isHe ? "חזרה לפרויקטים" : "Back to projects"}
        </Link>
        <div className="flex items-center gap-2">
          {project.readyCount > 0 ? (
            <a href={`/api/creative/projects/${project.id}/export`} download>
              <Button variant="secondary" size="sm">
                <Archive className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                {isHe ? `הורדת הכל (${project.readyCount})` : `Download all (${project.readyCount})`}
              </Button>
            </a>
          ) : null}
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
              project.status === "ready"
                ? "bg-emerald-100 text-emerald-700"
                : project.status === "generating"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-600"
            )}
          >
            {project.status}
          </span>
        </div>
      </div>

      {activeJob ? <JobProgressBanner job={activeJob} locale={locale} /> : null}
      {!activeJob && lastFinishedJob && lastFinishedJob.failedCount > 0 ? (
        <FailureBanner job={lastFinishedJob} locale={locale} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{isHe ? "תמונות מקור" : "Source images"}</CardTitle>
            <CardDescription>
              {isHe
                ? "התמונות שהעליתם — הן משמשות כקלט לAI."
                : "What you uploaded — used as the AI conditioning input."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              if (project.sources.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    {isHe ? "אין תמונות מקור." : "No source images attached."}
                  </p>
                );
              }
              const roleMap = project.brief?.sourceRoles ?? {};
              // Use the brief's sourceRoles to bucket uploads. Anything without
              // a role (legacy projects, or the very first upload before roles
              // were introduced) is treated as the product if it's the only one
              // and otherwise as a reference.
              const product =
                project.sources.find((s) => roleMap[s.id]?.role === "product") ??
                (project.sources.length === 1 ? project.sources[0] : null);
              const references = project.sources.filter((s) => s !== product);
              return (
                <div className="space-y-3">
                  {product ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                        {isHe ? "מוצר" : "Product"}
                      </p>
                      {product.fileUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.fileUrl}
                          alt="product"
                          className="w-full rounded-xl object-cover ring-2 ring-indigo-200"
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {references.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {isHe ? `השראה (${references.length})` : `Inspiration (${references.length})`}
                      </p>
                      <ul className="grid grid-cols-2 gap-2">
                        {references.map((source) => {
                          const label = roleMap[source.id]?.label?.trim();
                          return (
                            <li
                              key={source.id}
                              className="space-y-1 rounded-xl border border-border bg-card/60 p-1.5"
                            >
                              {source.fileUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={source.fileUrl}
                                  alt={label || "reference"}
                                  className="aspect-square w-full rounded-lg object-cover"
                                />
                              ) : null}
                              <p className="line-clamp-1 px-0.5 text-[10px] text-muted-foreground">
                                {label || (isHe ? "ללא תווית" : "no label")}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {project.brief ? (
              <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
                {project.brief.productName ? (
                  <p>
                    <span className="font-semibold">{isHe ? "מוצר: " : "Product: "}</span>
                    {project.brief.productName}
                  </p>
                ) : null}
                {project.brief.productDescription ? (
                  <p className="text-muted-foreground">{project.brief.productDescription}</p>
                ) : null}
                {project.brief.tone ? (
                  <p>
                    <span className="font-semibold">{isHe ? "טון: " : "Tone: "}</span>
                    {project.brief.tone}
                  </p>
                ) : null}
              </div>
            ) : null}

            {project.brief?.customPrompt ? (
              <div className="space-y-1.5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                  {isHe ? "הפרומפט שלכם" : "Your prompt"}
                </p>
                <p className="whitespace-pre-wrap text-xs leading-5 text-slate-900">
                  {project.brief.customPrompt}
                </p>
              </div>
            ) : null}

            <p className="text-[11px] text-muted-foreground">
              {isHe ? "ספק AI: " : "AI provider: "}
              <span className="font-semibold">{project.provider}</span>
            </p>
          </CardContent>
        </Card>

        <PublishToShopifyDialog
          projectId={project.id}
          assetId={publishingAssetId ?? ""}
          open={publishingAssetId !== null}
          onClose={() => setPublishingAssetId(null)}
          locale={locale}
        />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{isHe ? "נכסים שנוצרו" : "Generated assets"}</CardTitle>
            <CardDescription>
              {project.assets.length === 0
                ? isHe
                  ? "עדיין לא נוצרו נכסים."
                  : "No assets generated yet."
                : isHe
                  ? `${project.readyCount} מתוך ${project.assetCount} מוכנים`
                  : `${project.readyCount} of ${project.assetCount} ready`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {project.assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
                <ImageOff className="h-8 w-8" aria-hidden />
                <p className="text-sm">
                  {activeJob
                    ? isHe
                      ? "האצווה התחילה. הנכסים יופיעו כאן ברגע שיהיו מוכנים."
                      : "The batch has started. Assets will appear here as they finish."
                    : isHe
                      ? "צרו פרויקט חדש כדי להתחיל בייצור."
                      : "Create a new project to start generating."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {project.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="space-y-2 rounded-2xl border border-border bg-card/60 p-3 shadow-sm"
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                      {asset.status === "ready" && asset.fileUrl ? (
                        asset.assetType === "VIDEO" ? (
                          <video
                            src={asset.fileUrl}
                            poster={asset.thumbUrl ?? undefined}
                            controls
                            playsInline
                            preload="metadata"
                            className="absolute inset-0 h-full w-full bg-black object-cover"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={asset.fileUrl}
                            alt="generated asset"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )
                      ) : asset.status === "failed" ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-rose-600">
                          <AlertTriangle className="h-6 w-6" aria-hidden />
                          <p className="line-clamp-4 text-[11px] leading-4">
                            {asset.errorMessage ?? (isHe ? "הייצור נכשל." : "Generation failed.")}
                          </p>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(event) => {
                              event.preventDefault();
                              retryAsset(asset.id);
                            }}
                            disabled={retryingId === asset.id}
                          >
                            {retryingId === asset.id ? (
                              <Loader2 className={cn("h-3.5 w-3.5 animate-spin", isHe ? "ml-1.5" : "mr-1.5")} />
                            ) : (
                              <RotateCcw className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                            )}
                            {isHe ? "נסו שוב" : "Retry"}
                          </Button>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                          <p className="text-xs">
                            {asset.status === "pending"
                              ? isHe
                                ? "בתור…"
                                : "Queued…"
                              : isHe
                                ? "מייצר…"
                                : "Generating…"}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
                          asset.status === "ready"
                            ? "bg-emerald-100 text-emerald-700"
                            : asset.status === "failed"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {asset.status}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
                        {asset.status === "ready" ? (
                          <Link
                            href={
                              (asset.assetType === "VIDEO"
                                ? `/creative/${project.id}/edit-video/${asset.id}`
                                : `/creative/${project.id}/edit/${asset.id}`) as any
                            }
                          >
                            <Button variant="secondary" size="sm">
                              <Pencil className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                              {isHe ? "עריכה" : "Edit"}
                            </Button>
                          </Link>
                        ) : null}
                        {asset.status === "ready" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPublishingAssetId(asset.id)}
                          >
                            <Send className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                            {isHe ? "פרסום" : "Publish"}
                          </Button>
                        ) : null}
                        {asset.status === "ready" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => retryAsset(asset.id)}
                            disabled={retryingId === asset.id}
                          >
                            {retryingId === asset.id ? (
                              <Loader2 className={cn("h-3.5 w-3.5 animate-spin", isHe ? "ml-1.5" : "mr-1.5")} />
                            ) : (
                              <RotateCcw className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                            )}
                            {isHe ? "יצירה מחדש" : "Regenerate"}
                          </Button>
                        ) : null}
                        {asset.fileUrl ? (
                          // Use the same-origin download proxy. The raw
                          // asset.fileUrl is a cross-origin R2 presigned URL,
                          // for which the HTML `download` attribute is silently
                          // ignored by the browser — clicking it opened the
                          // image in a new tab instead of saving it.
                          <a href={`/api/creative/projects/${project.id}/assets/${asset.id}/download`} download>
                            <Button variant="secondary" size="sm">
                              <Download className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                              {isHe ? "הורדה" : "Download"}
                            </Button>
                          </a>
                        ) : null}
                      </div>
                    </div>
                    {asset.promptUsed ? (
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">{asset.promptUsed}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {failedAssets.length > 0 ? (
        <Card className="border-rose-200 bg-rose-50/40">
          <CardHeader className="cursor-pointer" onClick={() => setErrorsOpen((open) => !open)}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-rose-900">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  {isHe ? `יומן שגיאות (${failedAssets.length})` : `Error log (${failedAssets.length})`}
                </CardTitle>
                <CardDescription className="text-rose-800/80">
                  {isHe
                    ? "פעולות ייצור שנכשלו. כל שורה כוללת את הסיבה ואפשרות לנסות שוב."
                    : "Failed generations with the reason and a one-click retry."}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm">
                {errorsOpen ? (
                  <ChevronUp className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </div>
          </CardHeader>
          {errorsOpen ? (
            <CardContent className="space-y-2">
              {failedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-white/70 p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-rose-900">
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold">
                        {asset.assetType}
                      </span>
                      <span className="font-mono opacity-70">{asset.id.slice(0, 8)}</span>
                      <span className="opacity-60">
                        {new Date(asset.createdAt).toLocaleString(isHe ? "he-IL" : "en-US")}
                      </span>
                    </div>
                    <p className="break-words text-xs leading-5 text-rose-900">
                      {asset.errorMessage ?? (isHe ? "שגיאה לא ידועה." : "Unknown error.")}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => retryAsset(asset.id)}
                      disabled={retryingId === asset.id}
                    >
                      {retryingId === asset.id ? (
                        <Loader2 className={cn("h-3.5 w-3.5 animate-spin", isHe ? "ml-1.5" : "mr-1.5")} />
                      ) : (
                        <RotateCcw className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                      )}
                      {isHe ? "נסו שוב" : "Retry"}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function JobProgressBanner({ job, locale }: { job: JobProgress; locale: AppLocale }) {
  const isHe = locale === "he";
  const done = job.succeededCount + job.failedCount;
  const total = Math.max(1, job.targetCount);
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            {job.status === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Clock className="h-4 w-4" aria-hidden />
            )}
            {job.status === "queued"
              ? isHe
                ? "אצווה בתור — תתחיל בקרוב"
                : "Batch queued — starting shortly"
              : isHe
                ? `מייצר ${total} גרסאות`
                : `Generating ${total} versions`}
          </div>
          <div className="text-xs font-medium text-amber-900">
            {done} / {total}
            {job.failedCount > 0
              ? isHe
                ? ` (${job.failedCount} נכשלו)`
                : ` (${job.failedCount} failed)`
              : ""}
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200/60">
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function FailureBanner({ job, locale }: { job: JobProgress; locale: AppLocale }) {
  const isHe = locale === "he";
  return (
    <Card className="border-rose-200 bg-rose-50/60">
      <CardContent className="flex items-center gap-3 py-4 text-sm text-rose-900">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {isHe
          ? `הייצור הסתיים עם ${job.failedCount} כישלונות (${job.succeededCount} הצליחו).`
          : `Generation finished with ${job.failedCount} failures (${job.succeededCount} succeeded).`}
        {job.errorMessage ? <span className="opacity-80"> — {job.errorMessage}</span> : null}
      </CardContent>
    </Card>
  );
}
