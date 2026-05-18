import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import {
  getBroadcastStatsRequest,
  getBroadcastStatsResponse,
} from "@chatbotx.io/analytics/schemas"
import { withCache } from "@chatbotx.io/redis"
import { os } from "@orpc/server"
import { logger } from "../lib/log"

export const analyticsBroadcastRoutes = os.router({
  getBroadcastStatsAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/broadcasts/{broadcastId}/stats",
      summary: "Get broadcast stats",
      tags: ["Analytics", "Broadcasts"],
    })
    .input(getBroadcastStatsRequest)
    .output(getBroadcastStatsResponse)
    .handler(async ({ input }) =>
      withCache(
        `analytics:broadcast-stats:${input.workspaceId}:${input.broadcastId}`,
        async () => {
          try {
            return await broadcastAnalyticsService.getStats({
              workspaceId: input.workspaceId,
              broadcastId: input.broadcastId,
            })
          } catch (error) {
            logger.error({ err: error }, "[analytics:getBroadcastStats] failed")
            throw error
          }
        },
        { ttl: 120 },
      ),
    ),
})
