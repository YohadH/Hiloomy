// Trial-status banner shown above the AppShell on every page when the
// org is in trial mode. Shows days remaining + an "Upgrade" CTA. Stays
// quiet (only shows when relevant) so it doesn't nag paying customers.

import Link from "next/link";
import { Clock, AlertTriangle } from "lucide-react";
import type { SubscriptionInfo } from "@/lib/billing/subscription-status";

export function TrialBanner({
  info,
  locale = "he"
}: {
  info: SubscriptionInfo;
  locale?: "he" | "en";
}) {
  if (info.status !== "trial_active") return null;
  if (info.daysUntilTrialEnd == null) return null;

  const days = info.daysUntilTrialEnd;
  // Don't shout when there's >7 days left. Show a calm banner.
  const urgent = days <= 3;

  const t =
    locale === "he"
      ? {
          activeStart: "תקופת ניסיון פעילה — נותרו",
          day: "יום",
          days: "ימים",
          urgent: "התקופה מסתיימת בעוד",
          upgrade: "שדרגו עכשיו"
        }
      : {
          activeStart: "Trial active —",
          day: "day left",
          days: "days left",
          urgent: "Your trial ends in",
          upgrade: "Upgrade now"
        };

  const Icon = urgent ? AlertTriangle : Clock;
  const colors = urgent
    ? "border-amber-300 bg-amber-50 text-amber-900"
    : "border-violet-200 bg-violet-50/60 text-violet-900";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs ${colors}`}
      dir={locale === "he" ? "rtl" : "ltr"}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {urgent ? t.urgent : t.activeStart}{" "}
          <strong>{days}</strong>{" "}
          {days === 1 ? t.day : t.days}
          {urgent && locale === "en" ? "." : ""}
        </span>
      </div>
      <Link
        href={"/billing" as never}
        className="rounded-md bg-violet-700 px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-violet-800"
      >
        {t.upgrade}
      </Link>
    </div>
  );
}
