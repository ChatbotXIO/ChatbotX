import { conversationAnalyticsService } from "@chatbotx.io/analytics"
import {
  getConversationHandoffsResponseSchema,
  timeRangeQuerySchema,
} from "@chatbotx.io/analytics/schemas"
import { os } from "@orpc/server"

export const analyticsConversationRoutes = os.router({
  conversationHandoffsAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/conversation-handoffs",
      summary: "Get conversation handoffs",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getConversationHandoffsResponseSchema)
    .handler(async ({ input }) => {
      const data = await conversationAnalyticsService.getHandoffsByDay(input)
      return { data }
    }),
})
