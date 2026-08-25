// Silent-affiliate detection (F-004, detector 2).
//
// "We paid/seeded, got nothing": an affiliate whose code was used (product
// went out, commission accrued) but whose tracked Instagram presence shows
// no posts — or posts nobody engaged with — in the last 30 days. That is
// marketing spend with no delivery, exactly the leak the owner asked for.
//
// Honesty rule: we only judge affiliates whose creator profile IS tracked
// (matched by affiliate code or Instagram username). An untracked
// affiliate gets no verdict — "we can't see them" must never render as
// "they did nothing".

import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";
import {
  upsertAlert,
  resolveStaleAlerts
} from "@/lib/services/alert-writer-service";

const WINDOW_DAYS = 30;
// Total likes+comments+views across the window under this = "no engagement".
const MIN_ENGAGEMENT = 100;
// Only affiliates we actually invested in this window (commission accrued
// or coupon redeemed) can waste that investment.
const MIN_INVESTMENT = 100; // ₪ of commission + discount value combined
const DETECTOR = "silent-affiliate-alert-service";
const TYPE = "affiliate_no_engagement";

export interface SilentAffiliateAlertResult {
  fired: number;
  resolved: number;
  affiliatesUntracked: number;
}

export interface SilentAffiliateFlag {
  memberId: string;
  name: string;
  instagramUsername: string;
  couponCode: string | null;
  commission: number;
  couponValue: number;
  investment: number;
  postCount: number;
  engagement: number;
}

export interface SilentAffiliateComputation {
  flagged: SilentAffiliateFlag[];
  untracked: number;
  membersConsidered: number;
}

/**
 * The detection itself, shared by the alert engine AND the Leak Scan leg.
 */
export async function computeSilentAffiliates(storeId: string): Promise<SilentAffiliateComputation> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const members = (await db.affiliateMember.findMany({
    where: { storeId, status: { in: ["active", "approved"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      affiliateCode: true,
      couponCode: true,
      instagramUsername: true
    }
  })) as Array<{
    id: string;
    firstName: string;
    lastName: string;
    affiliateCode: string;
    couponCode: string | null;
    instagramUsername: string | null;
  }>;
  if (members.length === 0) return { flagged: [], untracked: 0, membersConsidered: 0 };

  // Investment per member this window: commission accrued + coupon value given.
  const [attributions, couponUsage, profiles] = await Promise.all([
    db.affiliateAttribution.groupBy({
      by: ["affiliateMemberId"],
      where: { storeId, occurredAt: { gte: since } },
      _sum: { commissionAmount: true }
    }) as Promise<Array<{ affiliateMemberId: string; _sum: { commissionAmount: unknown } }>>,
    db.discountUsage.groupBy({
      by: ["code"],
      where: {
        storeId,
        code: { in: members.map((m) => (m.couponCode ?? "").trim().toUpperCase()).filter(Boolean) },
        order: { createdAt: { gte: since }, cancelledAt: null, test: false }
      },
      _sum: { amount: true }
    }) as Promise<Array<{ code: string; _sum: { amount: unknown } }>>,
    db.creatorProfile.findMany({
      where: { storeId, platform: "instagram" },
      select: {
        id: true,
        username: true,
        affiliateCode: true,
        posts: {
          where: { postedAt: { gte: since } },
          select: { likeCount: true, commentsCount: true, viewCount: true }
        }
      }
    }) as Promise<
      Array<{
        id: string;
        username: string;
        affiliateCode: string | null;
        posts: Array<{ likeCount: number; commentsCount: number; viewCount: number }>;
      }>
    >
  ]);

  const commissionByMember = new Map<string, number>(
    attributions.map((a) => [a.affiliateMemberId, toNumber(a._sum.commissionAmount)])
  );
  const couponValueByCode = new Map<string, number>(
    couponUsage.map((c) => [c.code.toUpperCase(), toNumber(c._sum.amount)])
  );
  const profileByCode = new Map<string, (typeof profiles)[number]>();
  const profileByUsername = new Map<string, (typeof profiles)[number]>();
  for (const p of profiles) {
    if (p.affiliateCode) profileByCode.set(p.affiliateCode.trim().toUpperCase(), p);
    if (p.username) profileByUsername.set(p.username.trim().toLowerCase().replace(/^@/, ""), p);
  }

  const flagged: SilentAffiliateFlag[] = [];
  let untracked = 0;
  for (const member of members) {
    const commission = commissionByMember.get(member.id) ?? 0;
    const couponValue = member.couponCode
      ? couponValueByCode.get(member.couponCode.trim().toUpperCase()) ?? 0
      : 0;
    const investment = commission + couponValue;
    if (investment < MIN_INVESTMENT) continue;

    const profile =
      profileByCode.get(member.affiliateCode.trim().toUpperCase()) ??
      (member.instagramUsername
        ? profileByUsername.get(member.instagramUsername.trim().toLowerCase().replace(/^@/, ""))
        : undefined);
    if (!profile) {
      // We invested but can't see their feed — not a verdict, just untracked.
      untracked += 1;
      continue;
    }

    const postCount = profile.posts.length;
    const engagement = profile.posts.reduce(
      (s, p) => s + p.likeCount + p.commentsCount + p.viewCount,
      0
    );
    if (postCount > 0 && engagement >= MIN_ENGAGEMENT) continue;

    flagged.push({
      memberId: member.id,
      name: `${member.firstName} ${member.lastName}`.trim() || member.affiliateCode,
      instagramUsername: profile.username,
      couponCode: member.couponCode,
      commission,
      couponValue,
      investment,
      postCount,
      engagement
    });
  }
  return { flagged, untracked, membersConsidered: members.length };
}

export async function upsertSilentAffiliateAlerts(
  storeId: string
): Promise<SilentAffiliateAlertResult> {
  const computation = await computeSilentAffiliates(storeId);

  const keepFingerprints: string[] = [];
  for (const flag of computation.flagged) {
    const { name, commission, couponValue, investment, postCount, engagement } = flag;
    const fingerprint = `${TYPE}:${flag.memberId}`;
    keepFingerprints.push(fingerprint);

    const evidence =
      postCount === 0
        ? `לא פורסם אף פוסט בפרופיל @${flag.instagramUsername} ב־${WINDOW_DAYS} הימים האחרונים.`
        : `${postCount} פוסטים ב־${WINDOW_DAYS} הימים האחרונים עם מעורבות כוללת של ${engagement.toLocaleString("en-US")} בלבד (לייקים+תגובות+צפיות).`;

    await upsertAlert({
      storeId,
      type: TYPE,
      fingerprint,
      severity: investment >= 1000 ? "high" : "medium",
      source: "Instagram",
      detectedBy: DETECTOR,
      title: `${name} — השקעה בשותפה בלי חשיפה בצד השני`,
      description:
        `השקעה ב־${WINDOW_DAYS} הימים האחרונים: ` +
        `${commission > 0 ? `₪${Math.round(commission).toLocaleString("en-US")} עמלות` : ""}` +
        `${commission > 0 && couponValue > 0 ? " + " : ""}` +
        `${couponValue > 0 ? `₪${Math.round(couponValue).toLocaleString("en-US")} שווי הנחות בקוד ${flag.couponCode}` : ""}. ` +
        evidence,
      recommendedAction:
        postCount === 0
          ? `לפנות ל${name}: סוכם תוכן בתמורה לשיתוף הפעולה — לתאם מועד פרסום, או להשהות את הקוד עד שיש תוצר.`
          : `התוכן של ${name} לא מגיע לקהל. לשקול בריף אחר, פורמט אחר (רילס במקום סטורי), או להסיט את התקציב לשותפה שמייצרת חשיפה.`,
      metricName: "affiliate_engagement_30d",
      currentValue: engagement,
      relatedEntityType: "affiliate",
      relatedEntityId: flag.memberId,
      payloadJson: {
        affiliateName: name,
        instagramUsername: flag.instagramUsername,
        commission,
        couponValue,
        postCount,
        engagement,
        windowDays: WINDOW_DAYS
      },
      periodLabel: `${WINDOW_DAYS} ימים אחרונים`
    }).catch((err) => {
      console.error("[silent-affiliate] alert upsert failed:", err);
    });
  }

  const swept = await resolveStaleAlerts({
    storeId,
    detectedBy: DETECTOR,
    type: TYPE,
    keepFingerprints
  }).catch(() => ({ resolved: 0 }));

  return {
    fired: keepFingerprints.length,
    resolved: swept.resolved,
    affiliatesUntracked: computation.untracked
  };
}
