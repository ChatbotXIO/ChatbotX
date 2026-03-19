import {
  botMessageAnalyticsService,
  contactAnalyticsService,
  timeRangeQueryWithGranularityMHDSchema,
} from "@chatbotx.io/analytics"
import {
  getBotMessagesAIProvidersResponseSchema,
  getMessagesBySenderStatsResponseSchema,
  getMessagesStatsResponseSchema,
  timeRangeQuerySchema,
  timeRangeQueryWithGranularityDMSchema,
} from "@chatbotx.io/analytics/schemas"
import { os } from "@orpc/server"

export const analyticsMessageRoutes = os.router({
  botMessagesByResultAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/bot-messages-by-result",
      summary: "Get bot messages by result",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithGranularityMHDSchema)
    .output(getMessagesStatsResponseSchema)
    .handler(async ({ input }) => {
      const data = await botMessageAnalyticsService.getMessagesByResult(input)
      return { data }
    }),

  botMessagesWithResponseAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/bot-messages-with-response",
      summary: "Get bot messages with response",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithGranularityMHDSchema)
    .output(getMessagesStatsResponseSchema)
    .handler(async ({ input }) => {
      const data =
        await botMessageAnalyticsService.getMessagesWithResponse(input)
      return { data }
    }),

  botMessagesNoResponseAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/bot-messages-no-response",
      summary: "Get bot messages with no response",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithGranularityMHDSchema)
    .output(getMessagesStatsResponseSchema)
    .handler(async ({ input }) => {
      const data =
        await botMessageAnalyticsService.getMessagesWithNoResponse(input)
      return { data }
    }),

  botMessagesAIProvidersAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/bot-messages-ai-providers",
      summary: "Get bot messages AI providers",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getBotMessagesAIProvidersResponseSchema)
    .handler(async ({ input }) => {
      const data = await botMessageAnalyticsService.getAIProviderStats(input)
      return { data }
    }),
  messagesBySenderAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/messages-by-sender",
      summary: "Get messages by sender",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithGranularityDMSchema)
    .output(getMessagesBySenderStatsResponseSchema)
    .handler(async ({ input }) => {
      const data = await contactAnalyticsService.getMessagesBySender(input)
      return { data }
    }),
})
