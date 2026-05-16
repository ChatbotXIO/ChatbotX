import { sequenceAnalyticsService } from "@chatbotx.io/analytics"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
} from "@chatbotx.io/analytics/schemas"
import { withCache } from "@chatbotx.io/redis"
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
    .handler(async ({ input }) =>
      withCache(
        `analytics:sequence-step-stats:${input.workspaceId}:${input.sequenceId}:${input.stepId}`,
        () =>
          sequenceAnalyticsService.getStepStats({
            workspaceId: input.workspaceId,
            sequenceId: input.sequenceId,
            stepId: input.stepId,
          }),
        { ttl: 120 },
      ),
    ),
})
