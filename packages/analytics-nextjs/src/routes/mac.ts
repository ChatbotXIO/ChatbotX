import { macAnalyticsService } from "@chatbotx.io/analytics"
import { os } from "@orpc/server"
import { z } from "zod"

const workspaceIdInput = z.object({
  workspaceId: z.string(),
})

const billingIdInput = z.object({
  billingId: z.string(),
})

const macCountResponseSchema = z.object({
  data: z.object({
    macCount: z.number(),
  }),
})

export const analyticsMacRoutes = os.router({
  macActiveContactCountByWorkspaceAPI: os
    .route({
      method: "GET",
      path: "/analytics/mac/active-count/workspace",
      summary: "Get current period MAC count for a workspace",
      tags: ["Analytics", "MAC"],
    })
    .input(workspaceIdInput)
    .output(macCountResponseSchema)
    .handler(async ({ input }) => {
      const macCount =
        await macAnalyticsService.getActiveContactCountByWorkspaceId(input)
      return { data: { macCount } }
    }),

  macActiveContactCountByBillingAPI: os
    .route({
      method: "GET",
      path: "/analytics/mac/active-count/billing",
      summary: "Get current period MAC count for a billing identity",
      tags: ["Analytics", "MAC"],
    })
    .input(billingIdInput)
    .output(macCountResponseSchema)
    .handler(async ({ input }) => {
      const macCount =
        await macAnalyticsService.getActiveContactCountByBillingId(input)
      return { data: { macCount } }
    }),
})
