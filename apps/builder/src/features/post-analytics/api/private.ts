import { z } from "zod"
import {
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

/**
 * The Analytics tab's session-authed procedures. Each needs the member's
 * `broadcast` permission (the Posts page's own gate), parses the same request
 * as its public counterpart (`api/public.ts`) plus the workspace id, and calls
 * the same operation.
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
      workspacePermissionMiddleware("broadcast"),
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
      workspacePermissionMiddleware("broadcast"),
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
      workspacePermissionMiddleware("broadcast"),
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
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postAnalyticsOperations.bestTimes(input.workspaceId, input),
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
