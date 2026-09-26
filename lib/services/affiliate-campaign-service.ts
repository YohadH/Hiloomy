// Affiliate campaigns + briefs (ported from the Creators project into our
// models, 2026-09-26). A campaign is a named push with a link code; a brief is
// one thing one affiliate has to publish on one date. Clicks (AttributionSession)
// and orders (AffiliateAttribution) carry campaignId, so each campaign can
// report clicks, orders and sales without a second attribution engine.

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { normalizeCampaignCode, shortLinkUrl, appProxyShortLinkUrl } from "@/lib/services/affiliate-short-link-service";
import { sanitizeDestinationPath } from "@/lib/services/affiliate-link-tracking-service";
import { BRIEF_FORMATS, isBriefFormat, isBriefStatus, isCampaignStatus, pickBriefForClick, type BriefFormat, type BriefStatus, type CampaignStatus } from "@/lib/domain/affiliate-campaign";

const db = () => getDb() as any;

export interface CampaignInput {
  name: string;
  code: string;
  description?: string | null;
  promoText?: string | null;
  couponCode?: string | null;
  destinationPath?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: CampaignStatus;
}

function cleanCampaign(input: CampaignInput) {
  const name = String(input.name ?? "").trim().slice(0, 120);
  const code = normalizeCampaignCode(input.code);
  if (!name) throw new AppError("Campaign name is required.", 400);
  if (!code) throw new AppError("Campaign code is required (letters, digits, dashes).", 400);
  const rawCoupon = String(input.couponCode ?? "").trim();
  const status = input.status ?? "active";
  if (!isCampaignStatus(status)) throw new AppError("Unknown campaign status.", 400);
  const date = (v: unknown) => {
    if (!v) return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return {
    name,
    code,
    description: String(input.description ?? "").trim().slice(0, 2000) || null,
    promoText: String(input.promoText ?? "").trim().slice(0, 500) || null,
    couponCode: /^[A-Za-z0-9._-]{1,64}$/.test(rawCoupon) ? rawCoupon : null,
    destinationPath: sanitizeDestinationPath(input.destinationPath),
    startsAt: date(input.startsAt),
    endsAt: date(input.endsAt),
    status
  };
}

export async function createCampaign(storeId: string, input: CampaignInput) {
  const data = cleanCampaign(input);
  try {
    return await db().affiliateCampaign.create({ data: { storeId, ...data } });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") throw new AppError(`A campaign with the code "${data.code}" already exists.`, 409);
    throw error;
  }
}

export async function updateCampaign(storeId: string, campaignId: string, input: CampaignInput) {
  const data = cleanCampaign(input);
  const existing = await db().affiliateCampaign.findFirst({ where: { id: campaignId, storeId }, select: { id: true } });
  if (!existing) throw new AppError("Campaign not found.", 404);
  try {
    return await db().affiliateCampaign.update({ where: { id: campaignId }, data });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") throw new AppError(`A campaign with the code "${data.code}" already exists.`, 409);
    throw error;
  }
}

export interface CampaignSummary {
  id: string;
  name: string;
  code: string;
  status: CampaignStatus;
  promoText: string | null;
  couponCode: string | null;
  destinationPath: string;
  startsAt: Date | null;
  endsAt: Date | null;
  briefs: number;
  posted: number;
  affiliates: number;
  clicks: number;
  orders: number;
  sales: number;
  commission: number;
}

export async function listCampaigns(storeId: string): Promise<CampaignSummary[]> {
  const d = db();
  const [campaigns, clicks, perf] = await Promise.all([
    d.affiliateCampaign.findMany({
      where: { storeId },
      include: { briefs: { select: { affiliateMemberId: true, status: true } } },
      orderBy: [{ status: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }]
    }),
    d.attributionSession.groupBy({ by: ["campaignId"], where: { storeId, campaignId: { not: null } }, _count: { _all: true } }).catch(() => []),
    d.affiliateAttribution.groupBy({
      by: ["campaignId"],
      where: { storeId, campaignId: { not: null }, payoutStatus: { notIn: ["cancelled", "refunded"] } },
      _sum: { salesAmount: true, commissionAmount: true, ordersCount: true }
    }).catch(() => [])
  ]);
  const clicksBy = new Map<string, number>(clicks.map((c: any) => [c.campaignId, c._count._all]));
  const perfBy = new Map<string, any>(perf.map((p: any) => [p.campaignId, p._sum]));
  return campaigns.map((c: any) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    status: c.status,
    promoText: c.promoText,
    couponCode: c.couponCode,
    destinationPath: c.destinationPath,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    briefs: c.briefs.length,
    posted: c.briefs.filter((b: any) => b.status === "posted").length,
    affiliates: new Set(c.briefs.map((b: any) => b.affiliateMemberId)).size,
    clicks: clicksBy.get(c.id) ?? 0,
    orders: Number(perfBy.get(c.id)?.ordersCount ?? 0),
    sales: Number(perfBy.get(c.id)?.salesAmount ?? 0),
    commission: Number(perfBy.get(c.id)?.commissionAmount ?? 0)
  }));
}

export interface BriefRow {
  id: string;
  affiliateMemberId: string;
  affiliateName: string;
  affiliateCode: string;
  instagramUsername: string | null;
  dueDate: Date;
  format: BriefFormat;
  title: string;
  instructions: string | null;
  status: BriefStatus;
  postedAt: Date | null;
  postUrl: string | null;
  clicks: number;
  link: string | null; // {token}-{code} on hiloomy.com, when the member has a short link
  storeLink: string | null;
}

export interface CampaignDetail {
  id: string;
  storeId: string;
  name: string;
  code: string;
  description: string | null;
  promoText: string | null;
  couponCode: string | null;
  destinationPath: string;
  startsAt: Date | null;
  endsAt: Date | null;
  status: CampaignStatus;
  createdAt: Date;
  updatedAt: Date;
  briefs: BriefRow[];
}

export async function getCampaign(storeId: string, campaignId: string): Promise<CampaignDetail> {
  const d = db();
  const campaign = await d.affiliateCampaign.findFirst({
    where: { id: campaignId, storeId },
    include: {
      store: { select: { domain: true } },
      briefs: {
        include: { affiliateMember: { select: { id: true, firstName: true, lastName: true, affiliateCode: true, instagramUsername: true, trackedShortLinks: { select: { token: true }, orderBy: { createdAt: "asc" }, take: 1 } } } },
        orderBy: [{ dueDate: "asc" }]
      }
    }
  });
  if (!campaign) throw new AppError("Campaign not found.", 404);
  const clicksByBrief = await d.attributionSession.groupBy({ by: ["briefId"], where: { storeId, campaignId, briefId: { not: null } }, _count: { _all: true } }).catch(() => []);
  const clickMap = new Map<string, number>(clicksByBrief.map((c: any) => [c.briefId, c._count._all]));
  const briefs: BriefRow[] = campaign.briefs.map((b: any) => {
    const token = b.affiliateMember.trackedShortLinks[0]?.token ?? null;
    return {
      id: b.id,
      affiliateMemberId: b.affiliateMemberId,
      affiliateName: `${b.affiliateMember.firstName} ${b.affiliateMember.lastName}`.trim(),
      affiliateCode: b.affiliateMember.affiliateCode,
      instagramUsername: b.affiliateMember.instagramUsername ?? null,
      dueDate: b.dueDate,
      format: b.format,
      title: b.title,
      instructions: b.instructions,
      status: b.status,
      postedAt: b.postedAt,
      postUrl: b.postUrl,
      clicks: clickMap.get(b.id) ?? 0,
      link: token ? shortLinkUrl(token, campaign.code) : null,
      storeLink: token && campaign.store?.domain ? appProxyShortLinkUrl(campaign.store.domain, token, campaign.code) : null
    };
  });
  const { store: _store, briefs: _raw, ...rest } = campaign;
  void _store; void _raw;
  return { ...(rest as Omit<CampaignDetail, "briefs">), briefs };
}

export interface BriefInput {
  affiliateMemberIds: string[];
  dueDate: string;
  format?: BriefFormat;
  title: string;
  instructions?: string | null;
}

export async function addBriefs(storeId: string, campaignId: string, input: BriefInput) {
  const d = db();
  const campaign = await d.affiliateCampaign.findFirst({ where: { id: campaignId, storeId }, select: { id: true } });
  if (!campaign) throw new AppError("Campaign not found.", 404);
  const dueDate = new Date(input.dueDate);
  if (Number.isNaN(dueDate.getTime())) throw new AppError("Due date is required.", 400);
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!title) throw new AppError("Brief title is required.", 400);
  const format = input.format ?? "post";
  if (!isBriefFormat(format)) throw new AppError(`Format must be one of ${BRIEF_FORMATS.join(", ")}.`, 400);
  const ids = [...new Set((input.affiliateMemberIds ?? []).map(String))];
  if (!ids.length) throw new AppError("Choose at least one affiliate.", 400);
  // Ownership: every member must belong to this store.
  const members = await d.affiliateMember.findMany({ where: { storeId, id: { in: ids } }, select: { id: true } });
  if (members.length !== ids.length) throw new AppError("One of the affiliates does not belong to this store.", 403);
  const instructions = String(input.instructions ?? "").trim().slice(0, 2000) || null;
  await d.affiliateBrief.createMany({ data: ids.map((affiliateMemberId) => ({ storeId, campaignId, affiliateMemberId, dueDate, format, title, instructions })) });
  return { created: ids.length };
}

export async function updateBrief(storeId: string, briefId: string, input: { status?: BriefStatus; postUrl?: string | null; dueDate?: string | null; title?: string | null; instructions?: string | null }) {
  const d = db();
  const brief = await d.affiliateBrief.findFirst({ where: { id: briefId, storeId }, select: { id: true } });
  if (!brief) throw new AppError("Brief not found.", 404);
  const data: Record<string, unknown> = {};
  if (input.status !== undefined) {
    if (!isBriefStatus(input.status)) throw new AppError("Unknown brief status.", 400);
    data.status = input.status;
    data.postedAt = input.status === "posted" ? new Date() : null;
  }
  if (input.postUrl !== undefined) data.postUrl = String(input.postUrl ?? "").trim().slice(0, 500) || null;
  if (input.dueDate) {
    const due = new Date(input.dueDate);
    if (!Number.isNaN(due.getTime())) data.dueDate = due;
  }
  if (input.title !== undefined && input.title !== null) data.title = String(input.title).trim().slice(0, 200) || undefined;
  if (input.instructions !== undefined) data.instructions = String(input.instructions ?? "").trim().slice(0, 2000) || null;
  return d.affiliateBrief.update({ where: { id: briefId }, data });
}

export async function deleteBrief(storeId: string, briefId: string) {
  const r = await db().affiliateBrief.deleteMany({ where: { id: briefId, storeId } });
  if (!r.count) throw new AppError("Brief not found.", 404);
}

// Creator side: only her own briefs, only "I posted it" (+ optional URL).
export async function markBriefPostedByMember(memberId: string, storeId: string, briefId: string, postUrl: string | null) {
  const d = db();
  const brief = await d.affiliateBrief.findFirst({ where: { id: briefId, storeId, affiliateMemberId: memberId }, select: { id: true, status: true } });
  if (!brief) throw new AppError("Brief not found.", 404);
  if (brief.status === "cancelled") throw new AppError("This brief was cancelled.", 400);
  const url = String(postUrl ?? "").trim().slice(0, 500);
  return d.affiliateBrief.update({ where: { id: briefId }, data: { status: "posted", postedAt: new Date(), postUrl: /^https?:\/\//i.test(url) ? url : null } });
}

export interface MemberBrief {
  id: string;
  campaignName: string;
  campaignCode: string;
  promoText: string | null;
  couponCode: string | null;
  dueDate: Date;
  format: BriefFormat;
  title: string;
  instructions: string | null;
  status: BriefStatus;
  postedAt: Date | null;
  postUrl: string | null;
  link: string | null;
}

export async function listBriefsForMember(memberId: string, storeId: string): Promise<MemberBrief[]> {
  const d = db();
  if (!d.affiliateBrief) return [];
  const [briefs, member, store] = await Promise.all([
    d.affiliateBrief.findMany({ where: { storeId, affiliateMemberId: memberId, status: { not: "cancelled" } }, include: { campaign: true }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] }),
    d.affiliateMember.findUnique({ where: { id: memberId }, select: { referralLink: true, trackedShortLinks: { select: { token: true }, orderBy: { createdAt: "asc" }, take: 1 } } }),
    d.store.findUnique({ where: { id: storeId }, select: { domain: true } })
  ]);
  const token: string | null = member?.trackedShortLinks?.[0]?.token ?? null;
  return briefs.map((b: any) => {
    let link: string | null = null;
    if (token) link = shortLinkUrl(token, b.campaign.code);
    else if (member?.referralLink) {
      try {
        const u = new URL(member.referralLink);
        u.searchParams.set("utm_campaign", b.campaign.code);
        link = u.toString();
      } catch {
        link = member.referralLink;
      }
    }
    void store;
    return {
      id: b.id,
      campaignName: b.campaign.name,
      campaignCode: b.campaign.code,
      promoText: b.campaign.promoText ?? null,
      couponCode: b.campaign.couponCode ?? null,
      dueDate: b.dueDate,
      format: b.format,
      title: b.title,
      instructions: b.instructions,
      status: b.status,
      postedAt: b.postedAt,
      postUrl: b.postUrl,
      link
    };
  });
}

// Link resolver hook: a campaign code on a short link maps to a campaign of
// the link's store (active or draft; ended campaigns still attribute but do
// not override destination). Returns the brief the click should be tied to.
export async function resolveCampaignForLink(storeId: string, affiliateMemberId: string, campaignCode: string | null): Promise<{ campaignId: string; briefId: string | null; destinationPath: string | null; couponCode: string | null } | null> {
  if (!campaignCode) return null;
  const d = db();
  if (!d?.affiliateCampaign) return null;
  const campaign = await d.affiliateCampaign.findUnique({ where: { storeId_code: { storeId, code: campaignCode } } }).catch(() => null);
  if (!campaign) return null;
  const briefs = await d.affiliateBrief.findMany({ where: { campaignId: campaign.id, affiliateMemberId }, select: { id: true, status: true, dueDate: true } }).catch(() => []);
  const brief = pickBriefForClick(briefs);
  const live = campaign.status !== "ended";
  return {
    campaignId: campaign.id,
    briefId: brief?.id ?? null,
    destinationPath: live && campaign.destinationPath && campaign.destinationPath !== "/" ? campaign.destinationPath : null,
    couponCode: live ? campaign.couponCode ?? null : null
  };
}
