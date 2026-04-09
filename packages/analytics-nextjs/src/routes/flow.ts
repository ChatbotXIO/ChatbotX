import { flowAnalyticsService } from "@chatbotx.io/analytics"
import {
  flowNodeStatsResponse,
  flowStatsRequest,
} from "@chatbotx.io/analytics/schemas"
import { os } from "@orpc/server"

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
      await flowAnalyticsService.resetStatsSession({
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })
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
    .handler(async ({ input }) => {
      return await flowAnalyticsService.getFlowStats({
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })
    }),
})
