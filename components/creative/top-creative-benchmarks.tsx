import Link from "next/link";
import { Sparkles, Box, ImageIcon, Film, Megaphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/lib/i18n";
import type { CreativeProjectSummary, CreativeType } from "@/lib/domain/creative-types";

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

/**
 * Shows the top-performing (most recently completed) creative projects
 * as visual benchmarks/inspiration before the user starts a new generation.
 */
export function TopCreativeBenchmarks({
  topCreatives,
  locale
}: {
  topCreatives: CreativeProjectSummary[];
  locale: AppLocale;
}) {
  const isHe = locale === "he";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-base">
              {isHe ? "הקריאייטיבים המצליחים ביותר — השתמשו בהם כהשראה" : "Your best-performing creatives — use as inspiration"}
            </CardTitle>
            <CardDescription>
              {isHe
                ? "אלה הנכסים האחרונים שהופקו בהצלחה. לפני שמתחילים פרויקט חדש, כדאי לבחון מה כבר עבד."
                : "These are your most recently completed assets. Before generating something new, see what already worked."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {topCreatives.map((project) => {
            const Icon = TYPE_ICON[project.creativeType] ?? Sparkles;
            return (
              <Link
                key={project.id}
                href={`/creative/${project.id}` as any}
                className="group block focus:outline-none"
              >
                <div className="overflow-hidden rounded-xl border border-border transition-shadow group-hover:shadow-md">
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
                        <Icon className="h-8 w-8" aria-hidden />
                      </div>
                    )}
                    {/* "Best performer" ribbon */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
                      <p className="truncate text-[11px] font-medium text-white">{project.name}</p>
                      <p className="text-[10px] text-white/70">{typeLabel(project.creativeType, locale)}</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {isHe
            ? "לחיצה על נכס תפתח את הפרויקט לצפייה ועריכה."
            : "Click any creative to open the project for review or editing."}
        </p>
      </CardContent>
    </Card>
  );
}
