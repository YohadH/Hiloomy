import Link from "next/link";
import { Building2, Globe, Settings2, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { getDictionary } from "@/lib/i18n";

// Server-rendered sections of /settings — one component per page section,
// so the page file stays a thin composition layer.

type Dictionary = ReturnType<typeof getDictionary>;

/* ── Setup health ──────────────────────────────────────────────────── */

export function SetupHealthSection({
  report,
  locale
}: {
  report: import("@/lib/services/setup-health-service").SetupHealthReport;
  locale: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const tone =
    report.confidenceLevel === "high"
      ? "border-emerald-200 bg-emerald-50"
      : report.confidenceLevel === "medium"
        ? "border-amber-200 bg-amber-50"
        : "border-rose-200 bg-rose-50";
  const scoreColor =
    report.confidenceLevel === "high"
      ? "text-emerald-800"
      : report.confidenceLevel === "medium"
        ? "text-amber-800"
        : "text-rose-800";
  const sections: Array<{
    id: import("@/lib/services/setup-health-service").SetupCheck["category"];
    title: { he: string; en: string };
  }> = [
    { id: "connections", title: { he: "חיבורים", en: "Connections" } },
    { id: "configuration", title: { he: "הגדרות", en: "Configuration" } },
    { id: "data_quality", title: { he: "איכות נתונים", en: "Data quality" } }
  ];
  const checksByCategory = new Map<string, typeof report.checks>();
  for (const c of report.checks) {
    const existing = checksByCategory.get(c.category) ?? [];
    existing.push(c);
    checksByCategory.set(c.category, existing);
  }

  return (
    <div className={`rounded-xl border ${tone} p-5`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {lang("ביטחון בנתונים", "Data confidence")}
          </p>
          <p className={`text-2xl sm:text-3xl font-bold ${scoreColor}`}>
            {report.score}%{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({report.passed}/{report.checks.length} {lang("עברו", "passing")})
            </span>
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {report.failed > 0 ? (
            <p>
              <strong className="text-rose-800">{report.failed}</strong>{" "}
              {lang("חיבורים/הגדרות חסרים", "missing setup items")}
            </p>
          ) : null}
          {report.warnings > 0 ? (
            <p>
              <strong className="text-amber-800">{report.warnings}</strong>{" "}
              {lang("אזהרות לשיפור דיוק", "warnings to improve accuracy")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {sections.map((section) => {
          const items = checksByCategory.get(section.id) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={section.id}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title[isHe ? "he" : "en"]}
              </p>
              <ul className="space-y-2">
                {items.map((c) => {
                  const Icon =
                    c.status === "pass" ? CheckCircle2 : c.status === "warning" ? AlertTriangle : XCircle;
                  const iconColor =
                    c.status === "pass"
                      ? "text-emerald-600"
                      : c.status === "warning"
                        ? "text-amber-600"
                        : "text-rose-600";
                  return (
                    <li key={c.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${iconColor}`} aria-hidden />
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{c.title[isHe ? "he" : "en"]}</p>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {c.description[isHe ? "he" : "en"]}
                        </p>
                        {c.status !== "pass" && c.fixHref && c.fixLabel ? (
                          <a
                            href={c.fixHref}
                            className="mt-1.5 inline-block text-xs font-semibold text-sky-700 underline-offset-2 hover:underline"
                          >
                            → {c.fixLabel[isHe ? "he" : "en"]}
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Reporting defaults ────────────────────────────────────────────── */

export function ReportingSection({
  dictionary,
  rows
}: {
  dictionary: Dictionary;
  rows: Array<[string, string]>;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ── Organization & team ───────────────────────────────────────────── */

export interface OrgSummary {
  name: string;
  plan: string;
  members: number;
  stores: number;
  role: string;
}

export function OrganizationSection({ org, isHe }: { org: OrgSummary; isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
          </span>
          <CardTitle className="text-base">{lang("ארגון וצוות", "Organization & team")}</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          {lang(
            "ניהול חברי צוות, הזמנות, מותגים מחוברים ומסלול.",
            "Manage teammates, invitations, connected brands, and your plan."
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{org.name}</p>
            <p className="text-xs text-muted-foreground">
              {lang(
                `${org.stores} מותגים · ${org.members} חברי צוות · מסלול ${org.plan}`,
                `${org.stores} brands · ${org.members} members · ${org.plan} plan`
              )}
            </p>
          </div>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-green-700">
            {org.role}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={"/settings/organization" as never}
            className="inline-flex items-center rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:border-green-500"
          >
            {lang("ניהול צוות והזמנות", "Manage team & invites")}
          </Link>
          {org.stores >= 2 ? (
            <Link
              href={"/portfolio" as never}
              className="inline-flex items-center rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-green-300 hover:text-foreground"
            >
              {lang("דשבורד כל המותגים", "All-brands dashboard")}
            </Link>
          ) : null}
          <Link
            href={"/connect-brand" as never}
            className="inline-flex items-center rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-green-300 hover:text-foreground"
          >
            {lang("+ חיבור מותג נוסף", "+ Connect another brand")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Language ──────────────────────────────────────────────────────── */

export function LanguageSection({
  dictionary,
  children
}: {
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
            <Globe className="h-3.5 w-3.5" aria-hidden />
          </span>
          <CardTitle className="text-base">{dictionary.settings.languageTitle}</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">{dictionary.settings.languageDescription}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ── Roadmap / future integrations ─────────────────────────────────── */

export function RoadmapSection({ dictionary, isHe }: { dictionary: Dictionary; isHe: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
            <Wrench className="h-3.5 w-3.5" aria-hidden />
          </span>
          <CardTitle className="text-base">{dictionary.settings.futureTitle}</CardTitle>
          <HelpTip>
            {isHe
              ? "מה נחבר בהמשך, בשקיפות לגבי מה שעדיין לא בנוי."
              : "What we'll wire up next. Honest about what's not built yet."}
          </HelpTip>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.oauthTodo}</p>
        <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.costTodo}</p>
        <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.notificationsTodo}</p>
      </CardContent>
    </Card>
  );
}

// Icon import kept referenced (Settings2 used by future sections).
export const _icons = { Settings2 };
