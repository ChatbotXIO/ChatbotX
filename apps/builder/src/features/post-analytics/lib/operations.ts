import { postAnalyticsService } from "@chatbotx.io/business"
import type { z } from "zod"
import type {
  postAnalyticsBestTimesRequest,
  postAnalyticsFiltersRequest,
  postAnalyticsTimeseriesRequest,
  postAnalyticsTopPostsRequest,
  postMetricsRequest,
  socialPostMetricsRequest,
} from "../schema"

type FiltersInput = z.output<typeof postAnalyticsFiltersRequest>
type TimeseriesInput = z.output<typeof postAnalyticsTimeseriesRequest>
type TopPostsInput = z.output<typeof postAnalyticsTopPostsRequest>
type BestTimesInput = z.output<typeof postAnalyticsBestTimesRequest>
type PostMetricsInput = z.output<typeof postMetricsRequest>
type SocialPostMetricsInput = z.output<typeof socialPostMetricsRequest>

/**
 * The analytics operations the public API and the page's session procedures
 * share: both parse their own request shape and call these, so a rule changes
 * in one place.
 */
export const postAnalyticsOperations = {
  bestTimes: async (workspaceId: string, input: BestTimesInput) =>
    await postAnalyticsService.bestTimes({ ...input, workspaceId }),

  postMetrics: async (workspaceId: string, input: PostMetricsInput) =>
    await postAnalyticsService.postMetrics({ ...input, workspaceId }),

  socialPostMetrics: async (
    workspaceId: string,
    input: SocialPostMetricsInput,
  ) => await postAnalyticsService.socialPostMetrics({ ...input, workspaceId }),

  summary: async (workspaceId: string, input: FiltersInput) =>
    await postAnalyticsService.summary({ ...input, workspaceId }),

  timeseries: async (workspaceId: string, input: TimeseriesInput) =>
    await postAnalyticsService.timeseries({ ...input, workspaceId }),

  topPosts: async (workspaceId: string, input: TopPostsInput) =>
    await postAnalyticsService.topPosts({ ...input, workspaceId }),
}
