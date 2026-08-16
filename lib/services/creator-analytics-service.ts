import type { CreatorAnalyticsPayload } from "@/lib/domain/creator-types";
import { withOptionalDb } from "@/lib/server/db";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

export async function getCreatorAnalyticsPayload(): Promise<CreatorAnalyticsPayload> {
  const store = await resolveOrCreateBaseStore();
  if (!store) return buildPayload([]);

  const posts = await withOptionalDb(
    (db) =>
      db.creatorPost.findMany({
        where: { storeId: store.id },
        orderBy: { postedAt: "desc" },
        take: 12
      }),
    []
  );

  if (!posts.length) return buildPayload([]);

  const normalized = posts.map((post: any) => ({
    id: post.id,
    caption: post.caption ?? "Untitled post",
    permalink: post.permalink ?? null,
    mediaType: post.mediaType ?? "MEDIA",
    postedAt: post.postedAt.toISOString(),
    likes: post.likeCount ?? 0,
    comments: post.commentsCount ?? 0,
    views: post.viewCount ?? 0,
    attributedSales: Number(post.attributedSales ?? 0),
    attributedOrders: post.attributedOrders ?? 0
  }));

  return buildPayload(normalized);
}

function buildPayload(posts: CreatorAnalyticsPayload["postPerformance"]): CreatorAnalyticsPayload {
  const totalPosts = posts.length;
  const totalLikes = posts.reduce((sum, post) => sum + post.likes, 0);
  const totalComments = posts.reduce((sum, post) => sum + post.comments, 0);
  const totalViews = posts.reduce((sum, post) => sum + post.views, 0);
  const attributedSales = posts.reduce((sum, post) => sum + post.attributedSales, 0);
  const attributedOrders = posts.reduce((sum, post) => sum + post.attributedOrders, 0);
  const engagementRate = totalViews ? ((totalLikes + totalComments) / totalViews) * 100 : 0;

  return {
    totalPosts,
    totalLikes,
    totalComments,
    totalViews,
    attributedSales,
    attributedOrders,
    engagementRate,
    topPosts: [...posts].sort((a, b) => b.attributedSales - a.attributedSales).slice(0, 5),
    postPerformance: posts
  };
}
