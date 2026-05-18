import { flowAnalyticsService } from "@chatbotx.io/analytics"
import {
  flowNodeStatsResponse,
  flowStatsRequest,
} from "@chatbotx.io/analytics/schemas"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import { os } from "@orpc/server"
import { logger } from "../lib/log"

const flowStatsCacheTag = (flowId: string) => `flow-stats:${flowId}`
const flowStatsCacheKey = (workspaceId: string, flowId: string) =>
  `flow:stats:${workspaceId}:${flowId}`

export const analyticsFlowRoutes = os.router({
  resetFlowAnalytics: os
    .route({
      method: "DELETE",
      path: "/analytics/flows/{flowId}",
      summary: "Delete analytics sessions",
      tags: ["Analytics", "Flows"],
    })
    .input(flowStatsRequest)
    .handler(async ({ input }) => {
      try {
        await flowAnalyticsService.resetStatsSession({
          workspaceId: input.workspaceId,
          flowId: input.flowId,
        })
        await invalidateCacheByTags([flowStatsCacheTag(input.flowId)])
      } catch (error) {
        logger.error({ err: error }, "[analytics:resetFlowAnalytics] failed")
        throw error
      }
    }),
  getFlowAnalytics: os
    .route({
      method: "GET",
      path: "/analytics/flows/{flowId}",
      summary: "Get analytics sessions",
      tags: ["Analytics", "Flows"],
    })
    .input(flowStatsRequest)
    .output(flowNodeStatsResponse)
    .handler(async ({ input }) =>
      withCache(
        flowStatsCacheKey(input.workspaceId, input.flowId),
        async () => {
          try {
            return await flowAnalyticsService.getFlowStats({
              workspaceId: input.workspaceId,
              flowId: input.flowId,
            })
          } catch (error) {
            logger.error({ err: error }, "[analytics:getFlowAnalytics] failed")
            throw error
          }
        },
        { ttl: 120, tags: [flowStatsCacheTag(input.flowId)] },
      ),
    ),
})
