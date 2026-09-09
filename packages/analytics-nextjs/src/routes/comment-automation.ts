import {
  commentAutomationAnalyticsService,
  commentAutomationListSchema,
  commentAutomationStatsSchema,
  commentAutomationTimeseriesRow,
  listCommentAutomationErrorsResponse,
  listCommentAutomationTextTotalsResponse,
} from "@chatbotx.io/analytics"
import { os } from "@orpc/server"
import { z } from "zod"
import { logger } from "../lib/log"

export const analyticsCommentAutomationRoutes = os.router({
  commentAutomationReplyStats: os
    .route({
      method: "GET",
      path: "/analytics/comment-automation-replies",
      summary: "Get comment automation reply stats",
      tags: ["Analytics"],
    })
    .input(commentAutomationStatsSchema)
    .output(z.object({ data: z.array(commentAutomationTimeseriesRow) }))
    .handler(async ({ input }) => {
      try {
        const data =
          await commentAutomationAnalyticsService.getReplyStatsByDateRange(
            input,
          )
        return { data }
      } catch (error) {
        logger.error(
          { err: error },
          "[analytics:commentAutomationReplyStats] failed",
        )
        throw error
      }
    }),
  commentAutomationUserComments: os
    .route({
      method: "GET",
      path: "/analytics/comment-automation-user-comments",
      summary: "Get comment automation user comments",
      tags: ["Analytics"],
    })
    .input(commentAutomationListSchema)
    .output(listCommentAutomationTextTotalsResponse)
    .handler(async ({ input }) => {
      try {
        return await commentAutomationAnalyticsService.listUserComments(input)
      } catch (error) {
        logger.error(
          { err: error },
          "[analytics:commentAutomationUserComments] failed",
        )
        throw error
      }
    }),
  commentAutomationBotReplies: os
    .route({
      method: "GET",
      path: "/analytics/comment-automation-bot-replies",
      summary: "Get comment automation bot replies",
      tags: ["Analytics"],
    })
    .input(commentAutomationListSchema)
    .output(listCommentAutomationTextTotalsResponse)
    .handler(async ({ input }) => {
      try {
        return await commentAutomationAnalyticsService.listBotReplies(input)
      } catch (error) {
        logger.error(
          { err: error },
          "[analytics:commentAutomationBotReplies] failed",
        )
        throw error
      }
    }),
  commentAutomationErrors: os
    .route({
      method: "GET",
      path: "/analytics/comment-automation-errors",
      summary: "Get comment automation error logs",
      tags: ["Analytics"],
    })
    .input(commentAutomationListSchema)
    .output(listCommentAutomationErrorsResponse)
    .handler(async ({ input }) => {
      try {
        return await commentAutomationAnalyticsService.listErrors(input)
      } catch (error) {
        logger.error(
          { err: error },
          "[analytics:commentAutomationErrors] failed",
        )
        throw error
      }
    }),
})
