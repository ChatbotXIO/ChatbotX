import { conversationAnalyticsService } from "@chatbotx.io/analytics"
import {
  getConversationArchivedResponseSchema,
  getConversationAssignedByAdminResponseSchema,
  getConversationAssignedResponseSchema,
  getConversationFollowUpsResponseSchema,
  getConversationHandoffsResponseSchema,
  getUniqueConversationsByAdminResponseSchema,
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
      try {
        const data = await conversationAnalyticsService.getHandoffsByDay(input)
        return { data }
      } catch (error) {
        console.log("[analytics:conversationHandoffs] failed", error)
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
    .input(timeRangeQuerySchema)
    .output(getConversationFollowUpsResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await conversationAnalyticsService.getFollowUpsByDay(input)
        return { data }
      } catch (error) {
        console.log("[analytics:conversationFollowUps] failed", error)
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
    .input(timeRangeQuerySchema)
    .output(getConversationArchivedResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await conversationAnalyticsService.getArchivedByDay(input)
        return { data }
      } catch (error) {
        console.log("[analytics:conversationArchived] failed", error)
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
    .input(timeRangeQuerySchema)
    .output(getConversationAssignedResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data = await conversationAnalyticsService.getAssignedByDay(input)
        return { data }
      } catch (error) {
        console.log("[analytics:conversationAssigned] failed", error)
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
    .input(timeRangeQuerySchema)
    .output(getConversationAssignedByAdminResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data =
          await conversationAnalyticsService.getAssignedByAdmin(input)
        return { data }
      } catch (error) {
        console.log("[analytics:conversationAssignedByAdmin] failed", error)
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
    .input(timeRangeQuerySchema)
    .output(getUniqueConversationsByAdminResponseSchema)
    .handler(async ({ input }) => {
      try {
        const data =
          await conversationAnalyticsService.getUniqueConversationsByAdmin(
            input,
          )
        return { data }
      } catch (error) {
        console.log("[analytics:uniqueConversationsByAdmin] failed", error)
        throw error
      }
    }),
})
