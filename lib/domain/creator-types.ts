export interface CreatorPostAnalyticsRow {
  id: string;
  caption: string;
  permalink?: string | null;
  mediaType: string;
  postedAt: string;
  likes: number;
  comments: number;
  views: number;
  attributedSales: number;
  attributedOrders: number;
}

export interface CreatorAnalyticsPayload {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalViews: number;
  attributedSales: number;
  attributedOrders: number;
  engagementRate: number;
  topPosts: CreatorPostAnalyticsRow[];
  postPerformance: CreatorPostAnalyticsRow[];
}
