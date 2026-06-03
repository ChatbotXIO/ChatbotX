import { macAnalyticsService } from "@chatbotx.io/analytics"
import { os } from "@orpc/server"
import { z } from "zod"

const workspaceIdInput = z.object({
  workspaceId: z.string(),
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
})
