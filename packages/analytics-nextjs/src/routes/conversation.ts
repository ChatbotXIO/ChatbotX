import {
  agentResponseAnalyticsService,
  conversationAnalyticsService,
} from "@chatbotx.io/analytics"
import {
  getAgentResponseSeriesResponseSchema,
  getConversationArchivedResponseSchema,
  getConversationAssignedByAdminResponseSchema,
  getConversationAssignedResponseSchema,
  getConversationFollowUpsResponseSchema,
  getConversationHandoffsResponseSchema,
  getUniqueConversationsByAdminResponseSchema,
  timeRangeQueryWithFilterSchema,
} from "@chatbotx.io/analytics/schemas"
import { os } from "@orpc/server"
import { logger } from "../lib/log"

export const analyticsConversationRoutes = os.router({
  agentResponseSeriesAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/agent-response-series",
      summary: "Get agent response time series",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getAgentResponseSeriesResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data =
          await agentResponseAnalyticsService.getAgentResponseSeries(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:agentResponseSeries] failed")
        throw error
      }
    }),
  conversationHandoffsAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/conversation-handoffs",
      summary: "Get conversation handoffs",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getConversationHandoffsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await conversationAnalyticsService.getHandoffsByDay(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:conversationHandoffs] failed")
        throw error
      }
    }),
  conversationFollowUpsAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/conversation-followups",
      summary: "Get conversation follow-ups",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getConversationFollowUpsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await conversationAnalyticsService.getFollowUpsByDay(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:conversationFollowUps] failed")
        throw error
      }
    }),
  conversationArchivedAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/conversation-archived",
      summary: "Get archived conversations",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getConversationArchivedResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await conversationAnalyticsService.getArchivedByDay(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:conversationArchived] failed")
        throw error
      }
    }),
  conversationAssignedAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/conversation-assigned",
      summary: "Get assigned conversations",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getConversationAssignedResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await conversationAnalyticsService.getAssignedByDay(input)
        return { data }
      } catch (error) {
        logger.error({ err: error }, "[analytics:conversationAssigned] failed")
        throw error
      }
    }),
  conversationAssignedByAdminAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/conversation-assigned-by-admin",
      summary: "Get assigned conversations by admin",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getConversationAssignedByAdminResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data =
          await conversationAnalyticsService.getAssignedByAdmin(input)
        return { data }
      } catch (error) {
        logger.error(
          { err: error },
          "[analytics:conversationAssignedByAdmin] failed",
        )
        throw error
      }
    }),
  uniqueConversationsByAdminAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/unique-conversations-by-admin",
      summary: "Get unique conversations by admin",
      tags: ["Analytics"],
    })
    .input(timeRangeQueryWithFilterSchema)
    .output(getUniqueConversationsByAdminResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data =
          await conversationAnalyticsService.getUniqueConversationsByAdmin(
            input,
          )
        return { data }
      } catch (error) {
        logger.error(
          { err: error },
          "[analytics:uniqueConversationsByAdmin] failed",
        )
        throw error
      }
    }),
})
