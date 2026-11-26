import { postTopicService } from "@chatbotx.io/business"
import type { WorkspacePermissionKey } from "@chatbotx.io/business/workspace-member/permissions"
import { z } from "zod"
import {
  listPostTopicsRequest,
  listPostTopicsResponse,
} from "@/features/post-topics/schema"
import {
  workspaceAnyPermissionMiddleware,
  workspaceAuthorizedMidddleware,
  workspacePermissionMiddleware,
} from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { postAnalyticsOperations } from "../lib/operations"
import {
  postAnalyticsBestTimesRequest,
  postAnalyticsBestTimesResponse,
  postAnalyticsFiltersRequest,
  postAnalyticsSummaryResponse,
  postAnalyticsTimeseriesRequest,
  postAnalyticsTimeseriesResponse,
  postAnalyticsTopPostsRequest,
  postAnalyticsTopPostsResponse,
  postMetricsRequest,
  postMetricsResponse,
  socialPostMetricsRequest,
  socialPostMetricsResponse,
} from "../schema"

const tags = ["Posts"]
const inWorkspace = { workspaceId: z.string() }
const base = "/workspaces/{workspaceId}"
/** Dashboard > Posts needs `analytics`; Posts > Analytics needs `broadcast`. */
const OVERVIEW_PERMISSIONS: readonly WorkspacePermissionKey[] = [
  "analytics",
  "broadcast",
]

/**
 * The session-authed post analytics procedures. The four overview ones
 * (summary, timeseries, top posts, best times) and the topic list serve two
 * screens, the Posts section of the Analytics dashboard (`analytics`) and the
 * Analytics tab of Posts (`broadcast`), so a member with either permission
 * passes; the two per-post metrics ones are used inside the Posts pages (detail
 * sheet and composer) and keep the `broadcast` permission of those pages. The
 * topic list is the read-only twin of the Posts management one
 * (`post-topics/api`); its public counterpart is the `posts`-scope topic list.
 * Each parses the same request as its public counterpart (`api/public.ts`) plus
 * the workspace id, and calls the same operation.
 */
export const postAnalyticsAPIs = {
  privatePostAnalyticsSummaryAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-analytics/summary`,
      summary: "Get post analytics summary",
      tags,
    })
    .input(postAnalyticsFiltersRequest.extend(inWorkspace))
    .output(postAnalyticsSummaryResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspaceAnyPermissionMiddleware(OVERVIEW_PERMISSIONS),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postAnalyticsOperations.summary(input.workspaceId, input),
    ),

  privatePostAnalyticsTimeseriesAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-analytics/timeseries`,
      summary: "Get post analytics timeseries",
      tags,
    })
    .input(postAnalyticsTimeseriesRequest.extend(inWorkspace))
    .output(postAnalyticsTimeseriesResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspaceAnyPermissionMiddleware(OVERVIEW_PERMISSIONS),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postAnalyticsOperations.timeseries(input.workspaceId, input),
    ),

  privatePostAnalyticsTopPostsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-analytics/top-posts`,
      summary: "List top posts",
      tags,
    })
    .input(postAnalyticsTopPostsRequest.extend(inWorkspace))
    .output(postAnalyticsTopPostsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspaceAnyPermissionMiddleware(OVERVIEW_PERMISSIONS),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postAnalyticsOperations.topPosts(input.workspaceId, input),
    ),

  privatePostAnalyticsBestTimesAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-analytics/best-times`,
      summary: "Get best posting times",
      tags,
    })
    .input(postAnalyticsBestTimesRequest.extend(inWorkspace))
    .output(postAnalyticsBestTimesResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspaceAnyPermissionMiddleware(OVERVIEW_PERMISSIONS),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postAnalyticsOperations.bestTimes(input.workspaceId, input),
    ),

  privatePostAnalyticsTopicsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-analytics/topics`,
      summary: "List post topics for the analytics filter",
      tags,
    })
    .input(listPostTopicsRequest.extend(inWorkspace))
    .output(listPostTopicsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspaceAnyPermissionMiddleware(OVERVIEW_PERMISSIONS),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postTopicService.list({
          search: input.search,
          workspaceId: input.workspaceId,
        }),
    ),

  privateChannelPostMetricsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/channel-posts/management/{id}/metrics`,
      summary: "Get managed post metrics",
      tags,
    })
    .input(postMetricsRequest.extend(inWorkspace))
    .output(postMetricsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postAnalyticsOperations.postMetrics(input.workspaceId, input),
    ),

  privateSocialPostMetricsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/social-posts/{id}/metrics`,
      summary: "Get composed post metrics",
      tags,
    })
    .input(socialPostMetricsRequest.extend(inWorkspace))
    .output(socialPostMetricsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postAnalyticsOperations.socialPostMetrics(
          input.workspaceId,
          input,
        ),
    ),
}
