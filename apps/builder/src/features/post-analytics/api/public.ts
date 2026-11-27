import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
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
} from "../schema"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("posts")
const tags = ["Posts"]

const SNAPSHOT_NOTE =
  "Counts are measured from our own daily snapshots of each post's platform totals, so they start when the post was first synced. A count the platform never reported has `available: false` (unknown, not zero); a quiet window of a reported count is 0. Coverage details are on `postAnalytics.summary`."

const COVERAGE_NOTE =
  "Counts are measured from our own daily snapshots of each post's platform totals, so they start when the post was first synced (`coverage.trackingSince`); `coverage.level` says whether every post has history. A count the platform never reported has `available: false` (unknown, not zero)."

/** Read-only: every procedure here is a GET, open in a workspace whose plan has expired. */
export const postAnalyticsPublicRouter = {
  summary: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-analytics/summary",
      spec: mcpSpec({
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
        visibility: "default",
      }),
      summary: "Get post analytics summary",
      description: `Totals gained over a range of local days (comments, reactions, shares, engagement, views) with the change against the previous period of the same length, the number of posts published in the range, \`today\` (the current day in the workspace time zone) and \`coverage\`. Filter by \`channels\`, \`inboxIds\`, \`destinationIds\`, \`contentTypes\`, \`topicIds\`; \`from\`/\`to\` are workspace-local days (default last 30 days, at most 366). ${COVERAGE_NOTE}`,
      tags,
    })
    .input(postAnalyticsFiltersRequest)
    .output(postAnalyticsSummaryResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await postAnalyticsOperations.summary(context.workspace.id, input),
    ),

  timeseries: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-analytics/timeseries",
      summary: "Get post analytics timeseries",
      description: `Daily gain of one \`metric\` over the range, one point per local day (days with no change are 0), optionally split per \`channel\` or \`inbox\` (the 50 largest). ${SNAPSHOT_NOTE}`,
      tags,
    })
    .input(postAnalyticsTimeseriesRequest)
    .output(postAnalyticsTimeseriesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await postAnalyticsOperations.timeseries(context.workspace.id, input),
    ),

  topPosts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-analytics/top-posts",
      summary: "List top posts",
      description: `Up to 50 posts ranked by \`metric\`: \`rankBy: gained\` (default) by what they gained in the range, \`total\` by their current total among the posts published in the range. A post whose count was never reported is left out, not ranked as zero; removed posts are excluded. Open one with \`channelPostManagement.get\` or read its series with \`channelPostManagement.getMetrics\`. ${SNAPSHOT_NOTE}`,
      tags,
    })
    .input(postAnalyticsTopPostsRequest)
    .output(postAnalyticsTopPostsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await postAnalyticsOperations.topPosts(context.workspace.id, input),
    ),

  bestTimes: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-analytics/best-times",
      summary: "Get best posting times",
      description:
        "Ranks weekday x hour slots (workspace time zone, weekday 1 = Monday) by the engagement of posts published there in the last 90 days (at least 3 days old), each post relative to the median of its inbox. A slot needs 3 posts and the sample 20, otherwise `status` is `insufficientData` and `top` is empty; `slots` lists every slot with posts (the heatmap). Never applied automatically. Filter by `channels`, `inboxIds`, `destinationIds`, `contentTypes`, `topicIds`.",
      tags,
    })
    .input(postAnalyticsBestTimesRequest)
    .output(postAnalyticsBestTimesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await postAnalyticsOperations.bestTimes(context.workspace.id, input),
    ),
}
