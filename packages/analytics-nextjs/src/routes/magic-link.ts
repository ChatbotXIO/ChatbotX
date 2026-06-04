import {
  listFlowNodeContactsResponse,
  magicLinkAnalyticsService,
  magicLinkContactStatsSchema,
  magicLinkStatsSchema,
  refLinkTimeseriesRow,
} from "@chatbotx.io/analytics"
import { os } from "@orpc/server"
import { z } from "zod"
import { logger } from "../lib/log"

export const analyticsMagicLinkRoutes = os.router({
  magicLinkStats: os
    .route({
      method: "GET",
      path: "/analytics/magic-links-stats",
      summary: "Get magic link stats",
      tags: ["Analytics"],
    })
    .input(magicLinkStatsSchema)
    .output(z.object({ data: z.array(refLinkTimeseriesRow) }))
    .handler(async ({ input }) => {
      try {
        const data =
          await magicLinkAnalyticsService.getMagicLinkStatsByDateRange(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:magicLinkStats] failed")
        throw error
      }
    }),
  magicLinkContacts: os
    .route({
      method: "GET",
      path: "/analytics/magic-links-contacts",
      summary: "Get magic link contacts",
      tags: ["Analytics"],
    })
    .input(magicLinkContactStatsSchema)
    .output(listFlowNodeContactsResponse)
    .handler(async ({ input }) => {
      try {
        return await magicLinkAnalyticsService.getMagicLinkContactStats(input)
      } catch (error) {
        logger.error({ err: error }, "[analytics:magicLinkContacts] failed")
        throw error
      }
    }),
})
