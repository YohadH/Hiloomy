"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Sparkles, ImageIcon, Film, Megaphone, Box, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";
import type { CreativeProjectSummary, CreativeType } from "@/lib/domain/creative-types";
import { QuickBatchButton } from "@/components/creative/quick-batch-button";

const TYPE_ICON: Record<CreativeType, typeof Sparkles> = {
  PACKSHOT: Box,
  INSTAGRAM_POST: ImageIcon,
  UGC_VIDEO: Film,
  META_AD: Megaphone
};

function typeLabel(type: CreativeType, locale: AppLocale): string {
  if (locale === "he") {
    return {
      PACKSHOT: "פאקשוט",
      INSTAGRAM_POST: "פוסט לאינסטגרם",
      UGC_VIDEO: "סרטון UGC",
      META_AD: "מודעה לMeta"
    }[type];
  }
  return {
    PACKSHOT: "Packshot",
    INSTAGRAM_POST: "Instagram post",
    UGC_VIDEO: "UGC video",
    META_AD: "Meta ad"
  }[type];
}

function statusLabel(status: string, locale: AppLocale): string {
  if (locale === "he") {
    return (
      ({
        draft: "טיוטה",
        generating: "מייצר…",
        ready: "מוכן",
        archived: "ארכיון"
      } as Record<string, string>)[status] ?? status
    );
  }
  return (
    ({
      draft: "Draft",
      generating: "Generating…",
      ready: "Ready",
      archived: "Archived"
    } as Record<string, string>)[status] ?? status
  );
}

export function CreativeProjectsList({
  initialProjects,
  locale
}: {
  initialProjects: CreativeProjectSummary[];
  locale: AppLocale;
}) {
  const isHe = locale === "he";
  const router = useRouter();
  // Optimistic-remove + per-project loading. We don't keep a full local
  // mirror of projects (the page is a server component and re-fetches
  // on router.refresh); we just hide the deleted card immediately so
  // there's no flash of the row that's about to vanish.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  async function handleDelete(e: React.MouseEvent, projectId: string, projectName: string) {
    // The whole card is a Link — stopPropagation + preventDefault so
    // clicking the trash button doesn't navigate into the project.
    e.preventDefault();
    e.stopPropagation();
    const confirmMsg = isHe
      ? `למחוק את "${projectName}"? הפעולה אינה ניתנת לביטול.`
      : `Delete "${projectName}"? This can't be undone.`;
    if (!window.confirm(confirmMsg)) return;
    setDeletingId(projectId);
    try {
      const response = await fetch(`/api/creative/projects/${projectId}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        const message =
          (typeof body.error === "string" ? body.error : null) ??
          (isHe ? "המחיקה נכשלה — נסו שוב." : "Delete failed — try again.");
        window.alert(message);
        setDeletingId(null);
        return;
      }
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.add(projectId);
        return next;
      });
      setDeletingId(null);
      // Re-fetch the server component so any newly-arrived projects
      // (or other clients' edits) also reflect.
      router.refresh();
    } catch (err) {
      window.alert(
        isHe
          ? "תקלה ברשת. נסו שוב."
          : `Network error — try again. (${err instanceof Error ? err.message : String(err)})`
      );
      setDeletingId(null);
    }
  }

  const projects = initialProjects.filter((p) => !removedIds.has(p.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{isHe ? "הפרויקטים שלי" : "Your projects"}</h2>
          <p className="text-sm text-muted-foreground">
            {isHe
              ? "כל פרויקט מרכז את קבצי המקור ואת הנכסים שנוצרו מהם."
              : "Each project bundles your source uploads with the assets generated from them."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickBatchButton locale={locale} />
          <Link href={"/creative/new" as any}>
            <Button>
              <Plus className={cn("h-4 w-4", isHe ? "ml-2" : "mr-2")} />
              {isHe ? "פרויקט חדש" : "New project"}
            </Button>
          </Link>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Sparkles className="h-10 w-10 text-indigo-500" aria-hidden />
            <h3 className="text-base font-semibold">
              {isHe ? "אין עדיין פרויקטים" : "No projects yet"}
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {isHe
                ? "התחילו עם פאקשוט: העלו תמונת מוצר וקבלו תמונה מקצועית מוכנה לרשתות."
                : "Start with a packshot — upload a product photo and get a polished, ready-to-publish image back."}
            </p>
            <Link href={"/creative/new" as any}>
              <Button>
                <Plus className={cn("h-4 w-4", isHe ? "ml-2" : "mr-2")} />
                {isHe ? "צרו פרויקט ראשון" : "Create your first project"}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const Icon = TYPE_ICON[project.creativeType] ?? Sparkles;
            const isDeleting = deletingId === project.id;
            return (
              <Link
                key={project.id}
                href={`/creative/${project.id}` as any}
                className="group block focus:outline-none"
              >
                <Card className="overflow-hidden transition-shadow group-hover:shadow-md">
                  <div className="relative aspect-square w-full bg-muted">
                    {project.coverThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={project.coverThumbUrl}
                        alt={project.name}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        <Icon className="h-10 w-10" aria-hidden />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, project.id, project.name)}
                      disabled={isDeleting}
                      className={cn(
                        "absolute top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-rose-600 shadow-sm transition-opacity",
                        isHe ? "left-2" : "right-2",
                        "opacity-0 group-hover:opacity-100 focus:opacity-100",
                        "hover:bg-white hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-100"
                      )}
                      aria-label={isHe ? "מחיקת פרויקט" : "Delete project"}
                      title={isHe ? "מחיקת פרויקט" : "Delete project"}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold">{project.name}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                          project.status === "ready"
                            ? "bg-emerald-100 text-emerald-700"
                            : project.status === "generating"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {statusLabel(project.status, locale)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {typeLabel(project.creativeType, locale)}
                      </span>
                      <span>
                        {project.readyCount}/{project.assetCount || project.targetCount}{" "}
                        {isHe ? "מוכנים" : "ready"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
