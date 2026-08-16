"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  MarketingBrand,
  MarketingPlannerDataReadiness,
  MarketingPlannerDataReadinessStatus,
  MarketingPlannerDirection,
  MarketingPlannerExecutionMode,
  MarketingPlannerFocus,
  MarketingPlannerResult
} from "@/lib/domain/marketing-planner-types";

type NoticeTone = "success" | "error" | "info";

const DEFAULT_MONTH = new Date().toISOString().slice(0, 7);

function getNoticeClasses(tone: NoticeTone) {
  if (tone === "error") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-border bg-card text-muted-foreground";
}

function getReadinessClasses(status: MarketingPlannerDataReadinessStatus) {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function getReadinessBadge(status: MarketingPlannerDataReadinessStatus) {
  if (status === "ready") return "Ready";
  if (status === "warning") return "Needs review";
  return "Missing";
}

function getDirectionClasses(direction: MarketingPlannerDirection) {
  return direction === "rtl" ? "text-end" : "text-start";
}

function getFocusLabel(focusMode: MarketingPlannerFocus) {
  switch (focusMode) {
    case "site":
      return "Site / אתר";
    case "influencers":
      return "Influencers / משפיעניות";
    case "paid_ads":
      return "Paid Ads / פרסום ממומן";
    case "retention":
      return "Retention / שימור";
    default:
      return "Balanced / מאוזן";
  }
}

function getExecutionLabel(mode: MarketingPlannerExecutionMode) {
  return mode === "allow_create" ? "Allow create / אפשר יצירה" : "Recommend only / המלצות בלבד";
}

function formatCampaignRange(startDate: string, endDate: string, locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric" });
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return startDate === endDate
    ? formatter.format(start)
    : `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatMoney(value: number) {
  return `₪${Math.round(value).toLocaleString("en-US")}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "Not run yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatRating(value: number | null) {
  return value != null ? value.toFixed(1) : "-";
}

/** Derives a promotional-strength prediction from baseline + discounts */
function derivePrediction(result: MarketingPlannerResult): { label: string; color: string; detail: string } | null {
  const baseline = result.previousMonthBaseline;
  if (!baseline) return null;

  const returningRate = baseline.returningCustomerRate;
  const discountCount = result.discountProposals.filter((p) => p.canCreate).length;
  const campaignCount = result.campaigns.length;

  // Simple heuristic: strong if returning rate >=20%, >=2 campaigns, >=1 discount proposal
  const strengthScore =
    (returningRate >= 20 ? 2 : returningRate >= 10 ? 1 : 0) +
    (campaignCount >= 3 ? 2 : campaignCount >= 1 ? 1 : 0) +
    (discountCount >= 1 ? 1 : 0);

  if (strengthScore >= 4) {
    return {
      label: "המבצע צפוי להיות חזק",
      color: "border-emerald-200 bg-emerald-50 text-emerald-800",
      detail: `שיעור לקוחות חוזרים ${returningRate.toFixed(0)}%, ${campaignCount} קמפיינים מתוכננים ו-${discountCount} קוד/קודי הנחה מוכנים — רמז לפוטנציאל גבוה.`
    };
  }
  if (strengthScore >= 2) {
    return {
      label: "המבצע צפוי להיות בינוני",
      color: "border-amber-200 bg-amber-50 text-amber-800",
      detail: `שיעור לקוחות חוזרים ${returningRate.toFixed(0)}%. כדאי לחזק עם קוד הנחה ממוקד או הגדלת מספר הקמפיינים.`
    };
  }
  return {
    label: "המבצע עלול להיות חלש",
    color: "border-red-200 bg-red-50 text-red-700",
    detail: `שיעור לקוחות חוזרים ${returningRate.toFixed(0)}%, ${campaignCount} קמפיין/ים מתוכנן/ים. מומלץ להוסיף קמפיין שימור ו/או קוד הנחה לחיזוק.`
  };
}

function decodeBase64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function requestDataReadiness(input: {
  storeId: string;
  planningMonth: string;
  refresh: boolean;
}) {
  const response = await fetch("/api/marketing-planner/data-readiness", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Data readiness check failed.");
  }

  return payload as MarketingPlannerDataReadiness;
}

function DataReadinessCard({
  readiness,
  error,
  isRefreshing,
  onRefresh
}: {
  readiness: MarketingPlannerDataReadiness | null;
  error: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card dir="rtl" className="text-end">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Data readiness before GANT</CardTitle>
            <CardDescription>
              Check what the planner can use before it creates the monthly plan: Shopify, affiliates, Meta Ads, Instagram, and Flashy.
            </CardDescription>
          </div>
          <Button type="button" variant="secondary" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing data..." : "Refresh data before planning"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {readiness ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {readiness.summaryLines.map((line, index) => (
                <div key={`readiness-summary-${index}`} className="rounded-xl border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
                  {line}
                </div>
              ))}
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {readiness.sources.map((source) => (
                <div key={source.id} className={`rounded-2xl border p-4 text-sm ${getReadinessClasses(source.status)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{source.label}</p>
                    <Badge className="bg-white/70 text-current">{getReadinessBadge(source.status)}</Badge>
                  </div>
                  <p className="mt-2 leading-6">{source.headline}</p>
                  {source.lastUpdatedAt ? (
                    <p className="mt-1 text-xs opacity-80">Last updated: {formatDateTime(source.lastUpdatedAt, "he-IL")}</p>
                  ) : null}
                  {source.details.length ? (
                    <ul className="mt-3 space-y-1 leading-6">
                      {source.details.slice(0, 3).map((detail, index) => (
                        <li key={`${source.id}-detail-${index}`}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>

            {readiness.warnings.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">What the planner will treat carefully</p>
                <ul className="mt-2 space-y-1 leading-6">
                  {readiness.warnings.slice(0, 5).map((warning, index) => (
                    <li key={`readiness-warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Loading the current data checklist. If you want the freshest Instagram and Shopify state, click Refresh data before planning.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SectionList({
  title,
  items
}: {
  title: string;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
            {items.map((item, index) => (
              <li key={`${title}-${index}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">אין כרגע נקודות לסעיף הזה.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationsList({ items }: { items: MarketingPlannerResult["insights"]["recommendations"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">5. המלצות</CardTitle>
        <CardDescription>שינויים מדורגים לפי פוטנציאל ההשפעה.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length ? items.map((item, index) => (
          <div key={`${item.recommendation}-${index}`} className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm">
            <p className="font-semibold">
              [{item.impact}] - {item.recommendation}
            </p>
            <p className="mt-2 text-muted-foreground">
              <strong className="text-foreground">למה:</strong> {item.why}
            </p>
            <p className="mt-1 text-muted-foreground">
              <strong className="text-foreground">איפה בGANTT:</strong> {item.ganttPlacement}
            </p>
            {item.dataSource ? (
              <p className="mt-2 rounded-lg border border-border/50 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                <strong className="text-foreground">מקור המסקנה:</strong> {item.dataSource}
              </p>
            ) : (
              <p className="mt-2 rounded-lg border border-border/50 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                <strong className="text-foreground">מקור המסקנה:</strong> על סמך נתוני הבריף, החודש הקודם ותבניות עונתיות
              </p>
            )}
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">אין עדיין המלצות אוטומטיות לחודש הזה.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CampaignPlanPreview({
  result,
  direction,
  locale
}: {
  result: MarketingPlannerResult;
  direction: MarketingPlannerDirection;
  locale: string;
}) {
  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader>
        <CardTitle>קמפיינים שזוהו לGANTT</CardTitle>
        <CardDescription>
          זה מה שהמערכת משייכת לקובץ הExcel: שורת גאנט, תאריכים והמסר שנשלף מהבריף.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.campaigns.length ? result.campaigns.map((campaign) => (
          <div key={campaign.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{campaign.title || campaign.rowLabel}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{campaign.rowLabel}</Badge>
                <Badge>{formatCampaignRange(campaign.startDate, campaign.endDate, locale)}</Badge>
              </div>
            </div>
            {campaign.detailLines.length ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {campaign.detailLines.join(" · ")}
              </p>
            ) : null}
            {campaign.couponCodes.length ? (
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Codes: {campaign.couponCodes.join(", ")}
              </p>
            ) : null}
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">עדיין לא זוהו קמפיינים ישירים לגאנט.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PreviousMonthBaselineCard({
  result,
  direction
}: {
  result: MarketingPlannerResult;
  direction: MarketingPlannerDirection;
}) {
  const baseline = result.previousMonthBaseline;
  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Baseline מהחודש הקודם</CardTitle>
        <CardDescription>
          אותה חנות, אותו חיבור Shopify. כך הGANTT נבחן מול המצב האמיתי של העסק.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {baseline ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">הכנסות</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(baseline.revenue)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">הזמנות</p>
                <p className="mt-1 text-lg font-semibold">{baseline.orders}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">AOV</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(baseline.averageOrderValue)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">שיעור הזמנות חוזרות</p>
                <p className="mt-1 text-lg font-semibold">{formatPercent(baseline.returningCustomerRate)}</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {baseline.summaryLines.map((item, index) => (
                <li key={`baseline-${index}`}>{item}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">לא הצלחתי לטעון כרגע baseline של החודש הקודם מהחנות המחוברת.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DiscountDiagnosticsCard({
  result,
  direction
}: {
  result: MarketingPlannerResult;
  direction: MarketingPlannerDirection;
}) {
  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Discount red flags</CardTitle>
        <CardDescription>
          בדיקות Shopify-oriented: כמה קודים הלקוחה תפגוש, איפה יש חפיפה, ואיפה ההגדרות הקיימות עלולות להתנגש עם הבריף.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.discountDiagnostics.length ? result.discountDiagnostics.map((item, index) => (
          <div key={`${item.title}-${index}`} className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{item.severity.toUpperCase()}</Badge>
              <p className="font-semibold">{item.title}</p>
            </div>
            <p className="mt-2 leading-6 text-muted-foreground">{item.detail}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong className="text-foreground">איפה:</strong> {item.ganttPlacement}
            </p>
            {item.relatedCodes.length ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <strong className="text-foreground">קודים קשורים:</strong> {item.relatedCodes.join(", ")}
              </p>
            ) : null}
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">לא זוהו כרגע התנגשויות בולטות סביב קודי ההנחה.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DiscountProposalsCard({
  result,
  direction,
  isCreatingMap,
  onCreateDiscount
}: {
  result: MarketingPlannerResult;
  direction: MarketingPlannerDirection;
  isCreatingMap: Record<string, boolean>;
  onCreateDiscount: (proposal: MarketingPlannerResult["discountProposals"][number]) => void;
}) {
  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Discount candidates</CardTitle>
        <CardDescription>
          אם זוהו קוד + ערך הנחה ברור, אפשר ליצור את הקוד בShopify בלחיצה. היצירה מוגדרת כברירת מחדל כלא-נערמת עם קודים אחרים כדי למנוע בלבול ללקוחה.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.discountProposals.length ? result.discountProposals.map((proposal) => (
          <div key={proposal.id} className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{proposal.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {proposal.code} • {proposal.valueType && proposal.value != null ? `${proposal.valueType === "percent" ? `${proposal.value}%` : formatMoney(proposal.value)}` : "No detected value"} • {proposal.rowLabel}
                </p>
              </div>
              {result.executionMode === "allow_create" ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onCreateDiscount(proposal)}
                  disabled={!proposal.canCreate || isCreatingMap[proposal.id]}
                >
                  {isCreatingMap[proposal.id] ? "יוצר..." : "Create in Shopify"}
                </Button>
              ) : (
                <Badge>Recommendation only</Badge>
              )}
            </div>
            <p className="mt-2 leading-6 text-muted-foreground">{proposal.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatCampaignRange(proposal.startDate, proposal.endDate, "he-IL")} • פעם אחת ללקוחה: {proposal.appliesOncePerCustomer ? "כן" : "לא"} • stacking: blocked
            </p>
            {proposal.createDisabledReason ? (
              <p className="mt-2 text-xs text-red-600">{proposal.createDisabledReason}</p>
            ) : null}
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">לא זוהו כרגע קודי הנחה עם מספיק ודאות ליצירה אוטומטית.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CustomerVoiceCard({
  result,
  direction
}: {
  result: MarketingPlannerResult;
  direction: MarketingPlannerDirection;
}) {
  const customerVoice = result.customerVoice;

  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Customer voice / Flashy</CardTitle>
        <CardDescription>
          מה הלקוחות באמת אומרים על המוצרים הפעילים בחנות, כדי שהGANT וההמלצות לא יישענו רק על הבריף.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {customerVoice ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">ביקורות שנדגמו</p>
                <p className="mt-1 text-lg font-semibold">{customerVoice.sampledReviews}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">מוצרים שנדגמו</p>
                <p className="mt-1 text-lg font-semibold">{customerVoice.sampledProducts}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">דירוג ממוצע</p>
                <p className="mt-1 text-lg font-semibold">{formatRating(customerVoice.averageRating)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">ביקורות מאומתות</p>
                <p className="mt-1 text-lg font-semibold">{formatPercent(customerVoice.verifiedShare)}</p>
              </div>
            </div>

            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {customerVoice.summaryLines.map((item, index) => (
                <li key={`voice-summary-${index}`}>{item}</li>
              ))}
            </ul>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">מה עובד טוב בביקורות</p>
                {customerVoice.positiveTopics.length ? (
                  <div className="mt-3 space-y-3">
                    {customerVoice.positiveTopics.map((topic) => (
                      <div key={`positive-${topic.key}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>+{topic.mentions}</Badge>
                          <p className="font-medium">{topic.label}</p>
                        </div>
                        <p className="mt-2 leading-6 text-muted-foreground">{topic.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">אין עדיין נושא חיובי שחוזר מספיק במדגם כדי לסמן אותו ככיוון בטוח.</p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">מה צריך לשפר</p>
                {customerVoice.negativeTopics.length ? (
                  <div className="mt-3 space-y-3">
                    {customerVoice.negativeTopics.map((topic) => (
                      <div key={`negative-${topic.key}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="border-red-200 bg-red-50 text-red-700">-{topic.mentions}</Badge>
                          <p className="font-medium">{topic.label}</p>
                        </div>
                        <p className="mt-2 leading-6 text-muted-foreground">{topic.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">לא עלו כרגע תלונות חוזרות חזקות מתוך מדגם הביקורות האחרון.</p>
                )}
              </div>
            </div>

            {customerVoice.topProducts.length ? (
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">המוצרים הכי מדוברים כרגע</p>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {customerVoice.topProducts.map((product) => (
                    <div key={product.shopifyProductId} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                      <p className="font-medium">{product.title}</p>
                      <p className="mt-1 text-muted-foreground">
                        {product.sampleReviewCount} ביקורות במדגם • דירוג {formatRating(product.averageRating)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">לא נטענו כרגע נתוני Flashy לחנות הזאת, אז תובנות הלקוח נשענות כרגע רק על הבריף והנתונים המסחריים.</p>
        )}
      </CardContent>
    </Card>
  );
}

function InfluencerIntelligenceCard({
  result,
  direction
}: {
  result: MarketingPlannerResult;
  direction: MarketingPlannerDirection;
}) {
  const influencer = result.influencerIntelligence;
  const instagram = influencer?.instagramCrawl ?? null;
  const locale = direction === "rtl" ? "he-IL" : "en-US";

  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Influencer intelligence</CardTitle>
        <CardDescription>
          ביצועי היוצרות מתוך פורטל המשפיעניות והייחוס הקיים: קופונים, bg_ref, קליקים, הזמנות ומכירות.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {influencer ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">יוצרות ברשימה</p>
                <p className="mt-1 text-lg font-semibold">{influencer.totalCreators}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">פעילות בחודש הקודם</p>
                <p className="mt-1 text-lg font-semibold">{influencer.activeCreators}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">מכירות מיוחסות</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(influencer.totalSales)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">הזמנות</p>
                <p className="mt-1 text-lg font-semibold">{influencer.totalOrders}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">קליקים</p>
                <p className="mt-1 text-lg font-semibold">{influencer.totalClicks}</p>
              </div>
            </div>

            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {influencer.summaryLines.map((item, index) => (
                <li key={`influencer-summary-${index}`}>{item}</li>
              ))}
            </ul>

            {instagram ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sky-950">Instagram crawl evidence</p>
                    <p className="mt-1 text-sky-800">
                      This is the proof layer: what the public crawler checked, what it stored, and what the planner can use.
                    </p>
                  </div>
                  <Badge className="border-sky-200 bg-white text-sky-800">
                    {instagram.lastRunStatus ?? "not run"}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-sky-100 bg-white/80 p-3">
                    <p className="text-xs text-sky-700">Last crawl</p>
                    <p className="mt-1 font-semibold text-sky-950">{formatDateTime(instagram.lastRunAt, locale)}</p>
                  </div>
                  <div className="rounded-xl border border-sky-100 bg-white/80 p-3">
                    <p className="text-xs text-sky-700">Profiles checked</p>
                    <p className="mt-1 font-semibold text-sky-950">
                      {instagram.profilesCrawled}/{instagram.profilesRequested || instagram.profilesCrawled}
                    </p>
                  </div>
                  <div className="rounded-xl border border-sky-100 bg-white/80 p-3">
                    <p className="text-xs text-sky-700">Posts saved / updated</p>
                    <p className="mt-1 font-semibold text-sky-950">{instagram.postsSaved} / {instagram.postsUpdated}</p>
                  </div>
                  <div className="rounded-xl border border-sky-100 bg-white/80 p-3">
                    <p className="text-xs text-sky-700">Brand posts stored</p>
                    <p className="mt-1 font-semibold text-sky-950">{instagram.brandProfile?.postsStored ?? 0}</p>
                  </div>
                </div>

                {instagram.brandProfile ? (
                  <div className="mt-3 rounded-xl border border-sky-100 bg-white/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-sky-950">
                        Brand page: @{instagram.brandProfile.username}
                      </p>
                      <a
                        className="text-xs font-medium text-sky-700 underline-offset-4 hover:underline"
                        href={instagram.brandProfile.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open profile
                      </a>
                    </div>
                    <p className="mt-1 text-sky-800">
                      scanned {instagram.brandProfile.postsScanned}, stored {instagram.brandProfile.postsStored}, skipped unrelated {instagram.brandProfile.postsSkippedUnrelated}. {instagram.brandProfile.note}
                    </p>
                  </div>
                ) : null}

                {instagram.affiliateProfiles.length ? (
                  <div className="mt-3">
                    <p className="font-medium text-sky-950">Affiliate Instagram handles</p>
                    <div className="mt-2 grid gap-3 xl:grid-cols-2">
                      {instagram.affiliateProfiles.map((profile) => (
                        <div key={`instagram-profile-${profile.username}`} className="rounded-xl border border-sky-100 bg-white/80 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-sky-950">
                              {profile.affiliateName ? `${profile.affiliateName} - ` : ""}@{profile.username}
                            </p>
                            <Badge className="border-sky-200 bg-sky-50 text-sky-800">{profile.status}</Badge>
                          </div>
                          <p className="mt-1 text-sky-800">
                            scanned {profile.postsScanned}, found {profile.postsFound}, stored {profile.postsStored}, skipped {profile.postsSkippedUnrelated}
                          </p>
                          <p className="mt-1 text-sky-700">{profile.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-sky-100 bg-white/80 p-3 text-sky-800">
                    No affiliate Instagram handles are saved yet. Add profile URLs in the affiliate page, run the crawler, then regenerate the planner.
                  </p>
                )}

                {instagram.recentPosts.length ? (
                  <div className="mt-3">
                    <p className="font-medium text-sky-950">Recent public posts gathered</p>
                    <div className="mt-2 grid gap-3 xl:grid-cols-2">
                      {instagram.recentPosts.slice(0, 4).map((post) => (
                        <div key={`instagram-post-${post.id}`} className="rounded-xl border border-sky-100 bg-white/80 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-sky-950">@{post.username} - {post.mediaType}</p>
                            {post.permalink ? (
                              <a
                                className="text-xs font-medium text-sky-700 underline-offset-4 hover:underline"
                                href={post.permalink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open post
                              </a>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-sky-700">
                            {formatDateTime(post.postedAt, locale)} - {formatCompactNumber(post.views)} views - {formatCompactNumber(post.likes)} likes - {formatCompactNumber(post.comments)} comments
                          </p>
                          <p className="mt-2 leading-6 text-sky-800">{post.captionPreview || "No caption captured."}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {instagram.warnings.length ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    <p className="font-medium">Crawler warnings</p>
                    <ul className="mt-2 space-y-1 leading-6">
                      {instagram.warnings.map((warning, index) => (
                        <li key={`instagram-warning-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">יוצרות לסקייל</p>
                {influencer.topCreators.length ? (
                  <div className="mt-3 space-y-3">
                    {influencer.topCreators.slice(0, 4).map((creator) => (
                      <div key={`creator-scale-${creator.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{creator.name}</p>
                          <Badge>{creator.role}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatMoney(creator.sales)} • {creator.orders} הזמנות • קוד {creator.couponCode ?? creator.affiliateCode}
                        </p>
                        <p className="mt-2 leading-6 text-muted-foreground">{creator.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">אין עדיין יוצרות עם מכירות מיוחסות בחודש הקודם.</p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">יוצרות לבדיקה / זהירות</p>
                {influencer.watchCreators.length ? (
                  <div className="mt-3 space-y-3">
                    {influencer.watchCreators.slice(0, 4).map((creator) => (
                      <div key={`creator-watch-${creator.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{creator.name}</p>
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700">{creator.role}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatMoney(creator.sales)} • {creator.orders} הזמנות • {creator.clicks} קליקים
                        </p>
                        <p className="mt-2 leading-6 text-muted-foreground">{creator.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">לא זוהו כרגע יוצרות שדורשות זהירות מיוחדת.</p>
                )}
              </div>
            </div>

            {influencer.suggestedActions.length ? (
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">פעולות מומלצות לGANT</p>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {influencer.suggestedActions.map((action, index) => (
                    <div key={`influencer-action-${index}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{action.impact}</Badge>
                        <p className="font-medium">{action.action}</p>
                      </div>
                      <p className="mt-2 leading-6 text-muted-foreground">{action.why}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <strong className="text-foreground">איפה:</strong> {action.ganttPlacement}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {influencer.dataWarnings.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">פערי מדידה שכדאי לסגור</p>
                <ul className="mt-2 space-y-2 leading-6">
                  {influencer.dataWarnings.map((warning, index) => (
                    <li key={`influencer-warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">לא נטענו כרגע נתוני משפיעניות לחנות הזאת.</p>
        )}
      </CardContent>
    </Card>
  );
}

function MetaAdsIntelligenceCard({
  result,
  direction
}: {
  result: MarketingPlannerResult;
  direction: MarketingPlannerDirection;
}) {
  const metaAds = result.metaAds;

  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Meta Ads intelligence</CardTitle>
        <CardDescription>
          Daily campaign performance plus ad-level creative signals from the connected Meta ad account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {metaAds ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Campaigns</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.campaigns.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Creatives</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.topCreatives.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Spend</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(metaAds.totalSpend)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Purchases</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.totalPurchases}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Clicks</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.totalClicks.toLocaleString("en-US")}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Avg ROAS</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.averagePurchaseRoas != null ? metaAds.averagePurchaseRoas.toFixed(2) : "-"}</p>
              </div>
            </div>

            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {metaAds.summaryLines.map((line, index) => (
                <li key={`meta-summary-${index}`}>{line}</li>
              ))}
            </ul>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Best campaigns</p>
                {metaAds.topCampaigns.length ? (
                  <div className="mt-3 space-y-3">
                    {metaAds.topCampaigns.slice(0, 4).map((campaign) => (
                      <div key={`meta-top-${campaign.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{campaign.campaignName}</p>
                          <Badge>ROAS {campaign.purchaseRoas != null ? campaign.purchaseRoas.toFixed(2) : "-"}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatMoney(campaign.spend)} spend - {campaign.purchases} purchases - CTR {campaign.ctr.toFixed(2)}%
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No synced Meta campaigns yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Campaigns to review</p>
                {metaAds.watchCampaigns.length ? (
                  <div className="mt-3 space-y-3">
                    {metaAds.watchCampaigns.slice(0, 4).map((campaign) => (
                      <div key={`meta-watch-${campaign.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{campaign.campaignName}</p>
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700">Review</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatMoney(campaign.spend)} spend - {campaign.purchases} purchases - ROAS {campaign.purchaseRoas != null ? campaign.purchaseRoas.toFixed(2) : "-"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No obvious Meta Ads red flags in the synced window.</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Top running creatives / ads</p>
                {metaAds.topCreatives.length ? (
                  <div className="mt-3 space-y-3">
                    {metaAds.topCreatives.slice(0, 6).map((creative) => {
                      const creativeLabel = creative.creativeTitle ?? creative.creativeName ?? creative.adName ?? creative.campaignName;
                      const primaryLink = creative.creativePreviewUrl ?? creative.creativePermalinkUrl ?? creative.creativeObjectUrl ?? null;

                      return (
                        <div key={`meta-creative-${creative.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                          <div className="flex gap-3">
                            {creative.creativeThumbnailUrl ? (
                              <img
                                src={creative.creativeThumbnailUrl}
                                alt={creativeLabel}
                                className="h-20 w-20 rounded-lg border border-border object-cover"
                              />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">{creativeLabel}</p>
                                <Badge>ROAS {creative.purchaseRoas != null ? creative.purchaseRoas.toFixed(2) : "-"}</Badge>
                              </div>
                              <p className="mt-1 text-muted-foreground">
                                {creative.campaignName} - {formatMoney(creative.spend)} spend - {creative.purchases} purchases - CTR {creative.ctr.toFixed(2)}%
                              </p>
                              {creative.creativeBody ? (
                                <p className="mt-2 line-clamp-2 text-muted-foreground">{creative.creativeBody}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-2">
                                {primaryLink ? (
                                  <a
                                    href={primaryLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                  >
                                    Open creative
                                  </a>
                                ) : null}
                                {creative.creativePermalinkUrl && creative.creativePermalinkUrl !== primaryLink ? (
                                  <a
                                    href={creative.creativePermalinkUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                  >
                                    Public post
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No ad-level creative rows yet. Sync Meta Ads again after saving a token with ads_read access.</p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Daily performance</p>
                {metaAds.dailyBreakdown.length ? (
                  <div className="mt-3 space-y-2">
                    {metaAds.dailyBreakdown.slice(-14).map((day) => (
                      <div key={`meta-day-${day.id}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div>
                          <p className="font-medium">{day.dateStart}</p>
                          <p className="mt-1 text-muted-foreground">
                            {day.purchases} purchases - {day.clicks.toLocaleString("en-US")} clicks
                          </p>
                        </div>
                        <div className="text-start">
                          <p className="font-semibold">{formatMoney(day.spend)}</p>
                          <p className="mt-1 text-muted-foreground">ROAS {day.purchaseRoas != null ? day.purchaseRoas.toFixed(2) : "-"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No daily Meta breakdown was found in the latest sync.</p>
                )}
              </div>
            </div>

            {metaAds.dataWarnings.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">Meta data warnings</p>
                <ul className="mt-2 space-y-2 leading-6">
                  {metaAds.dataWarnings.map((warning, index) => (
                    <li key={`meta-warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Meta Ads is not connected or has not been synced yet. Add the token and ad account in Settings to include paid-media insights.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const ALL_FOCUS_OPTIONS: { value: MarketingPlannerFocus; label: string }[] = [
  { value: "balanced", label: "Balanced / מאוזן" },
  { value: "site", label: "Site / אתר" },
  { value: "influencers", label: "Influencers / משפיעניות" },
  { value: "paid_ads", label: "Paid Ads / פרסום ממומן" },
  { value: "retention", label: "Retention / שימור" }
];

export function MarketingBriefStudio({ storeId }: { storeId: string }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [brand, setBrand] = useState<MarketingBrand>("Incense");
  const [planningMonth, setPlanningMonth] = useState(DEFAULT_MONTH);
  const [briefText, setBriefText] = useState("");
  const [focusChannels, setFocusChannels] = useState("");
  const [focusMode, setFocusMode] = useState<MarketingPlannerFocus>("balanced");
  const [secondaryFocuses, setSecondaryFocuses] = useState<MarketingPlannerFocus[]>([]);
  const [executionMode, setExecutionMode] = useState<MarketingPlannerExecutionMode>("recommend_only");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<MarketingPlannerResult | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [dataReadiness, setDataReadiness] = useState<MarketingPlannerDataReadiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isCreatingMap, setIsCreatingMap] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  const summaryStats = useMemo(() => {
    if (!result) return null;
    return [
      { label: "קמפיינים", value: result.campaigns.length },
      { label: "ימי מפתח", value: result.specialDays.length },
      { label: "ביקורות Flashy", value: result.customerVoice?.sampledReviews ?? 0 },
      { label: "יוצרות פעילות", value: result.influencerIntelligence?.activeCreators ?? 0 },
      { label: "Meta spend", value: result.metaAds ? formatMoney(result.metaAds.totalSpend) : 0 },
      { label: "אזהרות discount", value: result.discountDiagnostics.length },
      { label: "קודים ליצירה", value: result.discountProposals.filter((item) => item.canCreate).length }
    ];
  }, [result]);
  const resultDirection: MarketingPlannerDirection = result?.contentDirection ?? "rtl";
  const resultLocale = result?.contentLocale === "en" ? "en-US" : "he-IL";

  useEffect(() => {
    let ignore = false;

    async function loadReadiness() {
      if (!storeId || !planningMonth) return;
      setReadinessError(null);

      try {
        const payload = await requestDataReadiness({ storeId, planningMonth, refresh: false });
        if (!ignore) {
          setDataReadiness(payload);
        }
      } catch (error) {
        if (!ignore) {
          setReadinessError(error instanceof Error ? error.message : "Data readiness check failed.");
        }
      }
    }

    loadReadiness();

    return () => {
      ignore = true;
    };
  }, [storeId, planningMonth]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  async function handleRefreshDataReadiness() {
    setIsRefreshingData(true);
    setReadinessError(null);
    setNotice(null);

    try {
      const payload = await requestDataReadiness({ storeId, planningMonth, refresh: true });
      setDataReadiness(payload);
      setNotice({
        tone: payload.warnings.length ? "info" : "success",
        text: payload.warnings.length
          ? "Data refresh finished with a few gaps. Check the readiness card before generating the GANT."
          : "Data refresh finished. The planner now has the latest available store, Meta Ads, Instagram, affiliate, and Flashy signals."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Data refresh failed.";
      setReadinessError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setIsRefreshingData(false);
    }
  }

  function triggerDownload(payload: MarketingPlannerResult) {
    const blob = decodeBase64ToBlob(payload.workbookBase64, payload.workbookMimeType);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreateDiscount(proposal: MarketingPlannerResult["discountProposals"][number]) {
    if (!result || !proposal.canCreate) return;

    setNotice(null);
    setIsCreatingMap((current) => ({ ...current, [proposal.id]: true }));

    try {
      const response = await fetch("/api/marketing-planner/create-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: result.storeScope.storeId,
          code: proposal.code,
          title: proposal.title,
          valueType: proposal.valueType,
          value: proposal.value,
          startDate: proposal.startDate,
          endDate: proposal.endDate,
          appliesOncePerCustomer: proposal.appliesOncePerCustomer,
          combinePolicy: proposal.combinePolicy
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "לא הצלחתי ליצור את קוד ההנחה בShopify.");
      }

      setResult((current) => current ? {
        ...current,
        discountProposals: current.discountProposals.map((item) => item.id === proposal.id
          ? {
              ...item,
              canCreate: false,
              alreadyExists: true,
              createDisabledReason: `נוצר בShopify כ-${payload.code}.`
            }
          : item)
      } : current);
      setNotice({
        tone: "success",
        text: `קוד ההנחה ${payload.code} נוצר בShopify בהצלחה.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "לא הצלחתי ליצור את קוד ההנחה בShopify."
      });
    } finally {
      setIsCreatingMap((current) => ({ ...current, [proposal.id]: false }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("brand", brand);
        formData.append("planningMonth", planningMonth);
        formData.append("briefText", briefText);
        formData.append("storeId", storeId);
        formData.append("focusChannels", focusChannels);
        formData.append("focusMode", focusMode);
        if (secondaryFocuses.length > 0) {
          formData.append("secondaryFocusModes", secondaryFocuses.join(","));
        }
        formData.append("executionMode", executionMode);
        if (selectedFile) {
          formData.append("file", selectedFile);
        }

        const response = await fetch("/api/marketing-planner/generate", {
          method: "POST",
          body: formData
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "יצירת הגאנט נכשלה.");
        }

        setResult(payload);
        setNotice({
          tone: "success",
          text: `הגאנט נוצר בהצלחה עבור ${payload.sheetName}. עכשיו יש לכם baseline מהחודש הקודם, אזהרות discount, customer voice מFlashy ותובנות משפיעניות.`
        });
      } catch (error) {
        setNotice({
          tone: "error",
          text: error instanceof Error ? error.message : "יצירת הגאנט נכשלה."
        });
      }
    });
  }

  return (
    <div className="space-y-6 text-end" dir="rtl">
      <DataReadinessCard
        readiness={dataReadiness}
        error={readinessError}
        isRefreshing={isRefreshingData}
        onRefresh={handleRefreshDataReadiness}
      />

      <Card dir="rtl" className="text-end">
        <CardHeader>
          <CardTitle>העלאת בריף</CardTitle>
          <CardDescription>
            העלו קובץ DOCX / PDF / TXT או הדביקו את הבריף כאן. הפעם הGANTT והתובנות נשענים גם על החנות המחוברת, החודש הקודם והגדרות discount בShopify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">מותג</span>
                <select
                  value={brand}
                  onChange={(event) => setBrand(event.target.value as MarketingBrand)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3"
                >
                  <option value="Incense">Incense / אינסנס</option>
                  <option value="After">After / אפטר</option>
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">חודש תכנון</span>
                <input
                  type="month"
                  value={planningMonth}
                  onChange={(event) => setPlanningMonth(event.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-background px-4 py-3"
                />
              </label>

              <div className="space-y-2 text-sm md:col-span-2">
                <span className="text-muted-foreground">פוקוס החודש</span>
                <div className="rounded-xl border border-border bg-background px-4 py-3 space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">פוקוס ראשי (אחד)</p>
                    <select
                      value={focusMode}
                      onChange={(event) => {
                        const newPrimary = event.target.value as MarketingPlannerFocus;
                        setFocusMode(newPrimary);
                        // Remove new primary from secondary if it was there
                        setSecondaryFocuses((prev) => prev.filter((f) => f !== newPrimary));
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      {ALL_FOCUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">פוקוס משני (אפשר כמה)</p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_FOCUS_OPTIONS.filter((opt) => opt.value !== focusMode).map((opt) => {
                        const checked = secondaryFocuses.includes(opt.value);
                        return (
                          <label
                            key={opt.value}
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                              checked
                                ? "border-violet-400 bg-violet-50 text-violet-700"
                                : "border-border bg-background text-muted-foreground hover:border-violet-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setSecondaryFocuses((prev) =>
                                  e.target.checked
                                    ? [...prev, opt.value]
                                    : prev.filter((f) => f !== opt.value)
                                );
                              }}
                              className="sr-only"
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                    {secondaryFocuses.length === 0 && (
                      <p className="text-xs text-muted-foreground">אין פוקוס משני — הגאנט ייבנה לפי הפוקוס הראשי בלבד</p>
                    )}
                  </div>
                </div>
              </div>

              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">מצב ביצוע</span>
                <select
                  value={executionMode}
                  onChange={(event) => setExecutionMode(event.target.value as MarketingPlannerExecutionMode)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3"
                >
                  <option value="recommend_only">Recommend only / המלצות בלבד</option>
                  <option value="allow_create">Allow create / אפשר יצירה</option>
                </select>
              </label>
            </div>

            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">פוקוס ערוצים או הערות נוספות</span>
              <input
                value={focusChannels}
                onChange={(event) => setFocusChannels(event.target.value)}
                dir="auto"
                placeholder="לדוגמה: להתמקד במשפיעניות, TikTok וניוזלטר או להיזהר מכפל קודי הנחה"
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>

            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3 rounded-2xl border border-dashed border-border/80 bg-background/60 p-4">
                <p className="text-sm font-semibold">קובץ בריף</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.pdf,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                />
                <p className="text-sm text-muted-foreground">
                  {selectedFile ? `נבחר: ${selectedFile.name}` : "אפשר להשאיר ריק אם את מדביקה את הטקסט ידנית."}
                </p>
                <div className="rounded-xl border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">הסטור בסקופ</p>
                  <p className="mt-1">{storeId}</p>
                </div>
              </div>

              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">טקסט הבריף</span>
                <textarea
                  value={briefText}
                  onChange={(event) => setBriefText(event.target.value)}
                  dir="auto"
                  rows={12}
                  placeholder="הדביקי כאן את הבריף המלא. אם עלה גם קובץ, המערכת תחבר בין המקורות."
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isPending}>
                {isPending ? "מייצר GANTT..." : "ייצור GANTT + תובנות"}
              </Button>
              {result ? (
                <Button type="button" variant="secondary" onClick={() => triggerDownload(result)} disabled={isPending}>
                  הורדת קובץ Excel
                </Button>
              ) : null}
              <Badge>{getFocusLabel(focusMode)}</Badge>
              {secondaryFocuses.map((f) => (
                <Badge key={f} className="border-violet-200 bg-violet-50 text-violet-700">{getFocusLabel(f)} (משני)</Badge>
              ))}
              <Badge>{getExecutionLabel(executionMode)}</Badge>
            </div>
          </form>
        </CardContent>
      </Card>

      {notice ? (
        <div dir={resultDirection} className={`rounded-2xl border px-4 py-3 text-sm ${getNoticeClasses(notice.tone)} ${getDirectionClasses(resultDirection)}`}>
          {notice.text}
        </div>
      ) : null}

      {result ? (
        <div dir={resultDirection} className={`space-y-6 ${getDirectionClasses(resultDirection)}`}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {summaryStats?.map((item) => (
              <Card key={item.label} dir={resultDirection} className={getDirectionClasses(resultDirection)}>
                <CardHeader className="pb-2">
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className="text-2xl">{item.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          {/* Predictive metric banner */}
          {(() => {
            const prediction = derivePrediction(result);
            if (!prediction) return null;
            return (
              <div className={`rounded-2xl border p-4 text-sm ${prediction.color}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-base">מדד חיזוי:</span>
                  <span className="font-medium">{prediction.label}</span>
                  <Badge className="bg-white/50 text-current text-xs">המלצה בלבד — לא תחזית מחייבת</Badge>
                </div>
                <p className="mt-2 leading-6">{prediction.detail}</p>
              </div>
            );
          })()}

          <div className="grid gap-4 xl:grid-cols-2">
            <Card dir={resultDirection} className={getDirectionClasses(resultDirection)}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Planner strategy</CardTitle>
                <CardDescription>איזה סטור נבחן, על מה החודש הזה אמור לעבוד, ואיזה מצב פעולה נבחר.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p><strong className="text-foreground">Store:</strong> {result.storeScope.storeDomain}</p>
                <p><strong className="text-foreground">Focus:</strong> {getFocusLabel(result.plannerFocus)}</p>
                <p><strong className="text-foreground">Mode:</strong> {getExecutionLabel(result.executionMode)}</p>
                <p><strong className="text-foreground">Parser:</strong> {result.parserMode}</p>
              </CardContent>
            </Card>

            <PreviousMonthBaselineCard result={result} direction={resultDirection} />
          </div>

          <CustomerVoiceCard result={result} direction={resultDirection} />

          <InfluencerIntelligenceCard result={result} direction={resultDirection} />

          <MetaAdsIntelligenceCard result={result} direction={resultDirection} />

          <CampaignPlanPreview result={result} direction={resultDirection} locale={resultLocale} />

          <div className="grid gap-4 xl:grid-cols-2">
            <DiscountDiagnosticsCard result={result} direction={resultDirection} />
            <DiscountProposalsCard
              result={result}
              direction={resultDirection}
              isCreatingMap={isCreatingMap}
              onCreateDiscount={handleCreateDiscount}
            />
          </div>

          <Card dir={resultDirection} className={getDirectionClasses(resultDirection)}>
            <CardHeader>
              <CardTitle>תובנות גרות&apos; אג&apos;נט / Growth Insights</CardTitle>
              <CardDescription>
                התובנות למטה כבר לא נשענות רק על הבריף. הן משלבות את הבריף עם הסטור המחובר, החודש הקודם, בחירת הפוקוס שלך ומבנה הdiscountים בShopify.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              <SectionList title="1. סיכום הבריף" items={result.insights.briefSummary} />
              <SectionList title="2. עימות מול לוח השנה" items={result.insights.calendarCheck} />
              <SectionList title="3. מגמות שעלולות להשפיע" items={result.insights.liveTrends} />
              <SectionList title="4. בעיות בתוכנית הנוכחית" items={result.insights.issues} />
              <RecommendationsList items={result.insights.recommendations} />
              <SectionList title="6. שאלות פתוחות" items={result.insights.openQuestions} />
            </CardContent>
          </Card>

          {result.unplacedItems.length ? (
            <Card dir={resultDirection} className={getDirectionClasses(resultDirection)}>
              <CardHeader>
                <CardTitle>פריטים שלא מוקמו אוטומטית</CardTitle>
                <CardDescription>
                  אלו שורות שהמערכת זיהתה בבריף אבל לא הצליחה למקם לשורה/תאריך בביטחון גבוה.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                  {result.unplacedItems.map((item, index) => (
                    <li key={`unplaced-${index}`}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
