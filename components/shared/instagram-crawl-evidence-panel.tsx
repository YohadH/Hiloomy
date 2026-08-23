import { Badge } from "@/components/ui/badge";
import type {
  MarketingPlannerDirection,
  MarketingPlannerInstagramCrawlEvidence
} from "@/lib/domain/marketing-planner-types";

function getDirectionClasses(direction: MarketingPlannerDirection) {
  return direction === "rtl" ? "text-right" : "text-left";
}

function formatDateTime(value: string | null | undefined, locale: string, isHe: boolean) {
  if (!value) return isHe ? "טרם רץ" : "Not run yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return isHe ? "לא ידוע" : "Unknown";

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

// Crawl run + profile statuses are raw enum values coming from the sync runs and
// the crawler. They stay untranslated in the data; only the badge text is mapped.
const RUN_STATUS_LABELS_HE: Record<string, string> = {
  success: "הצליח",
  running: "רץ",
  error: "שגיאה",
  failed: "נכשל",
  watch: "למעקב",
  partial: "חלקי"
};

const PROFILE_STATUS_LABELS_HE: Record<string, string> = {
  scanned: "נסרק",
  stored: "שמור",
  handle_saved: "שם משתמש נשמר",
  missing: "חסר"
};

export function InstagramCrawlEvidencePanel({
  instagram,
  direction = "ltr",
  dateRangeLabel,
  locale = "he",
  title,
  description
}: {
  instagram: MarketingPlannerInstagramCrawlEvidence;
  direction?: MarketingPlannerDirection;
  dateRangeLabel?: string | null;
  locale?: "he" | "en";
  title?: string;
  description?: string;
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const intlLocale = direction === "rtl" ? "he-IL" : "en-US";

  const resolvedTitle = title ?? lang("ראיות סריקת אינסטגרם", "Instagram crawl evidence");
  const resolvedDescription = description ?? lang(
    "זו שכבת ההוכחה: מה הסורק הציבורי בדק, מה הוא שמר, ובמה התובנות יכולות להשתמש.",
    "This is the proof layer: what the public crawler checked, what it stored, and what insights can use."
  );

  const runStatusRaw = instagram.lastRunStatus;
  const runStatusLabel = runStatusRaw
    ? (isHe ? RUN_STATUS_LABELS_HE[runStatusRaw] ?? runStatusRaw : runStatusRaw)
    : lang("לא רץ", "not run");

  return (
    <div dir={direction} className={`rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm ${getDirectionClasses(direction)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sky-950">{resolvedTitle}</p>
          <p className="mt-1 text-sky-800">{resolvedDescription}</p>
          {dateRangeLabel ? (
            <p className="mt-1 text-xs font-medium text-sky-700">
              {lang("מוצגים פוסטים שנשמרו בתוך:", "Showing stored posts inside:")} {dateRangeLabel}
            </p>
          ) : null}
        </div>
        <Badge className="border-sky-200 bg-white text-sky-800" title={runStatusRaw ?? undefined}>
          {runStatusLabel}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-sky-100 bg-white/80 p-3">
          <p className="text-xs text-sky-700">{lang("סריקה אחרונה", "Last crawl")}</p>
          <p className="mt-1 font-semibold text-sky-950">{formatDateTime(instagram.lastRunAt, intlLocale, isHe)}</p>
        </div>
        <div className="rounded-xl border border-sky-100 bg-white/80 p-3">
          <p className="text-xs text-sky-700">{lang("פרופילים שנבדקו", "Profiles checked")}</p>
          <p className="mt-1 font-semibold text-sky-950">
            {instagram.profilesCrawled}/{instagram.profilesRequested || instagram.profilesCrawled}
          </p>
        </div>
        <div className="rounded-xl border border-sky-100 bg-white/80 p-3">
          <p className="text-xs text-sky-700">{lang("פוסטים שנשמרו / עודכנו", "Posts saved / updated")}</p>
          <p className="mt-1 font-semibold text-sky-950">{instagram.postsSaved} / {instagram.postsUpdated}</p>
        </div>
        <div className="rounded-xl border border-sky-100 bg-white/80 p-3">
          <p className="text-xs text-sky-700">{lang("פוסטים של המותג שנשמרו", "Brand posts stored")}</p>
          <p className="mt-1 font-semibold text-sky-950">{instagram.brandProfile?.postsStored ?? 0}</p>
        </div>
      </div>

      {instagram.brandProfile ? (
        <div className="mt-3 rounded-xl border border-sky-100 bg-white/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-sky-950">
              {lang("עמוד המותג:", "Brand page:")} <span dir="ltr">@{instagram.brandProfile.username}</span>
            </p>
            <a
              className="text-xs font-medium text-sky-700 underline-offset-4 hover:underline"
              href={instagram.brandProfile.profileUrl}
              target="_blank"
              rel="noreferrer"
            >
              {lang("פתיחת הפרופיל", "Open profile")}
            </a>
          </div>
          <p className="mt-1 text-sky-800">
            {lang(
              `נסרקו ${instagram.brandProfile.postsScanned}, נשמרו ${instagram.brandProfile.postsStored}, דולגו כלא רלוונטיים ${instagram.brandProfile.postsSkippedUnrelated}.`,
              `scanned ${instagram.brandProfile.postsScanned}, stored ${instagram.brandProfile.postsStored}, skipped unrelated ${instagram.brandProfile.postsSkippedUnrelated}.`
            )}{" "}
            {instagram.brandProfile.note}
          </p>
        </div>
      ) : null}

      {instagram.affiliateProfiles.length ? (
        <div className="mt-3">
          <p className="font-medium text-sky-950">
            {lang("חשבונות אינסטגרם של שותפות", "Affiliate Instagram handles")}
          </p>
          <div className="mt-2 grid gap-3 xl:grid-cols-2">
            {instagram.affiliateProfiles.map((profile) => (
              <div key={`instagram-profile-${profile.username}`} className="rounded-xl border border-sky-100 bg-white/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-sky-950">
                    {profile.affiliateName ? `${profile.affiliateName} - ` : ""}
                    <span dir="ltr">@{profile.username}</span>
                  </p>
                  <Badge className="border-sky-200 bg-sky-50 text-sky-800" title={profile.status}>
                    {isHe ? PROFILE_STATUS_LABELS_HE[profile.status] ?? profile.status : profile.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sky-800">
                  {lang(
                    `נסרקו ${profile.postsScanned}, נמצאו ${profile.postsFound}, נשמרו ${profile.postsStored}, דולגו ${profile.postsSkippedUnrelated}`,
                    `scanned ${profile.postsScanned}, found ${profile.postsFound}, stored ${profile.postsStored}, skipped ${profile.postsSkippedUnrelated}`
                  )}
                </p>
                <p className="mt-1 text-sky-700">{profile.note}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-sky-100 bg-white/80 p-3 text-sky-800">
          {lang(
            "עדיין לא נשמרו חשבונות אינסטגרם של שותפות. הוסיפו כתובות פרופיל בעמוד השותפות, הריצו את הסורק ואז צרו מחדש את התוכנית.",
            "No affiliate Instagram handles are saved yet. Add profile URLs in the affiliate page, run the crawler, then regenerate the planner."
          )}
        </p>
      )}

      {instagram.recentPosts.length ? (
        <div className="mt-3">
          <p className="font-medium text-sky-950">
            {lang("פוסטים ציבוריים אחרונים שנאספו", "Recent public posts gathered")}
          </p>
          <div className="mt-2 grid gap-3 xl:grid-cols-2">
            {instagram.recentPosts.slice(0, 4).map((post) => (
              <div key={`instagram-post-${post.id}`} className="rounded-xl border border-sky-100 bg-white/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-sky-950">
                    <span dir="ltr">@{post.username}</span> - {post.mediaType}
                  </p>
                  {post.permalink ? (
                    <a
                      className="text-xs font-medium text-sky-700 underline-offset-4 hover:underline"
                      href={post.permalink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {lang("פתיחת הפוסט", "Open post")}
                    </a>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-sky-700">
                  {formatDateTime(post.postedAt, intlLocale, isHe)} - {formatCompactNumber(post.views)} {lang("צפיות", "views")} - {formatCompactNumber(post.likes)} {lang("לייקים", "likes")} - {formatCompactNumber(post.comments)} {lang("תגובות", "comments")}
                </p>
                <p className="mt-2 leading-6 text-sky-800">
                  {post.captionPreview || lang("לא נקלט כיתוב.", "No caption captured.")}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-sky-100 bg-white/80 p-3 text-sky-800">
          {lang(
            "אין עדיין פוסטים ציבוריים שמורים שמתאימים לחלון התאריכים הזה.",
            "No stored public posts match this date window yet."
          )}
        </p>
      )}

      {instagram.warnings.length ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
          <p className="font-medium">{lang("אזהרות הסורק", "Crawler warnings")}</p>
          <ul className="mt-2 space-y-1 leading-6">
            {instagram.warnings.map((warning, index) => (
              <li key={`instagram-warning-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
