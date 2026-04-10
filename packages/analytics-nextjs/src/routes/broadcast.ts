import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import {
  getBroadcastStatsRequest,
  getBroadcastStatsResponse,
} from "@chatbotx.io/analytics/schemas"
import { os } from "@orpc/server"

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
    .handler(async ({ input }) => {
      return await broadcastAnalyticsService.getStats({
        workspaceId: input.workspaceId,
        broadcastId: input.broadcastId,
      })
    }),
})
