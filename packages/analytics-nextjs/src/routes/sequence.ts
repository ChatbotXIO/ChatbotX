import { sequenceAnalyticsService } from "@chatbotx.io/analytics"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
} from "@chatbotx.io/analytics/schemas"
import { os } from "@orpc/server"

export const analyticsSequenceRoutes = os.router({
  getSequenceStepStatsAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/sequences/{sequenceId}/steps/{stepId}/stats",
      summary: "Get sequence step stats",
      tags: ["Analytics", "Sequences"],
    })
    .input(getSequenceStepStatsRequest)
    .output(getSequenceStepStatsResponse)
    .handler(async ({ input }) => {
      return await sequenceAnalyticsService.getStepStats({
        workspaceId: input.workspaceId,
        sequenceId: input.sequenceId,
        stepId: input.stepId,
      })
    }),
})
