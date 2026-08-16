import { Badge } from "@/components/ui/badge";
import type {
  MarketingPlannerDirection,
  MarketingPlannerInstagramCrawlEvidence
} from "@/lib/domain/marketing-planner-types";

function getDirectionClasses(direction: MarketingPlannerDirection) {
  return direction === "rtl" ? "text-right" : "text-left";
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

export function InstagramCrawlEvidencePanel({
  instagram,
  direction = "ltr",
  dateRangeLabel,
  title = "Instagram crawl evidence",
  description = "This is the proof layer: what the public crawler checked, what it stored, and what insights can use."
}: {
  instagram: MarketingPlannerInstagramCrawlEvidence;
  direction?: MarketingPlannerDirection;
  dateRangeLabel?: string | null;
  title?: string;
  description?: string;
}) {
  const locale = direction === "rtl" ? "he-IL" : "en-US";

  return (
    <div dir={direction} className={`rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm ${getDirectionClasses(direction)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sky-950">{title}</p>
          <p className="mt-1 text-sky-800">{description}</p>
          {dateRangeLabel ? (
            <p className="mt-1 text-xs font-medium text-sky-700">Showing stored posts inside: {dateRangeLabel}</p>
          ) : null}
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
      ) : (
        <p className="mt-3 rounded-xl border border-sky-100 bg-white/80 p-3 text-sky-800">
          No stored public posts match this date window yet.
        </p>
      )}

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
  );
}
