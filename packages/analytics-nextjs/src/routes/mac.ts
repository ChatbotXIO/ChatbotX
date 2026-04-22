import {
  macAnalyticsService,
  macTotalResponseSchema,
  macTrendResponseSchema,
} from "@chatbotx.io/analytics"
import { os } from "@orpc/server"
import { z } from "zod"

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const workspaceIdInput = z.object({
  workspaceId: z.string(),
})

const activeCountInput = workspaceIdInput.extend({
  billingId: z.string(),
})

const dailyBreakdownInput = workspaceIdInput.extend({
  from: dateString,
  to: dateString,
})

export const analyticsMacRoutes = os.router({
  macActiveContactCountAPI: os
    .route({
      method: "GET",
      path: "/analytics/mac/active-count",
      summary: "Get current period active contact count",
      tags: ["Analytics", "MAC"],
    })
    .input(activeCountInput)
    .output(macTotalResponseSchema)
    .handler(async ({ input }) => {
      const data = await macAnalyticsService.getActiveContactCount(input)
      return { data }
    }),

  macDailyBreakdownAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/mac/daily",
      summary: "Get MAC daily breakdown within a range",
      tags: ["Analytics", "MAC"],
    })
    .input(dailyBreakdownInput)
    .output(macTrendResponseSchema)
    .handler(async ({ input }) => {
      const data = await macAnalyticsService.getDailyBreakdown(input)
      return { data }
    }),
})
