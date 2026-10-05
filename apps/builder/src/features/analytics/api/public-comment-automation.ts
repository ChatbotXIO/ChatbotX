import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import { commentAutomationService } from "@chatbotx.io/business"
import { listCommentAutomationContacts } from "@/features/shared/comment-automation/lib/list-automation-contacts"
import { commentAutomationStatCounters } from "@/features/shared/comment-automation/lib/stat-counters"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  commentAutomationContactsPublicRequest,
  commentAutomationContactsPublicResponse,
  commentAutomationErrorsPublicRequest,
  commentAutomationErrorsPublicResponse,
  commentAutomationRepliesPublicResponse,
  commentAutomationStatsPublicRequest,
  commentAutomationTextTotalsPublicRequest,
  commentAutomationTextTotalsPublicResponse,
} from "../schema/public-comment-automation"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("analytics")

const toServiceRange = <T extends { from: string; to: string }>(
  input: T,
  workspaceId: string,
) => {
  const { from, to, ...rest } = input
  return { ...rest, startDate: from, endDate: to, workspaceId }
}

/**
 * The stats service answers an unknown or foreign id with an empty result;
 * a public caller gets a 404 instead, so a typo is not mistaken for "no
 * activity".
 */
const findAutomationOrFail = (workspaceId: string, automationId: string) =>
  commentAutomationService.findOrFail({ workspaceId, id: automationId })

export const commentAutomationAnalyticsPublicRouter = {
  commentAutomationReplies: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/comment-automations/{automationId}/replies",
      summary: "Get comment automation replies over time",
      description:
        "Returns how many replies one comment automation sent per day (per month past 60 days) over a time range. Lifetime sent/delivered/seen/failed counters are on the automation itself, e.g. `fbComments.get`.",
      tags: ["Analytics"],
    })
    .input(commentAutomationStatsPublicRequest)
    .output(commentAutomationRepliesPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      await findAutomationOrFail(context.workspace.id, input.automationId)
      return {
        data: await commentAutomationAnalyticsService.getReplyStatsByDateRange(
          toServiceRange(input, context.workspace.id),
        ),
      }
    }),

  commentAutomationUserComments: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/comment-automations/{automationId}/user-comments",
      summary: "List comment automation user comments",
      description:
        "Lists the distinct comments customers wrote that one comment automation answered, with how often each occurred, over a time range. Use `analytics.commentAutomationBotReplies` for what the bot replied.",
      tags: ["Analytics"],
    })
    .input(commentAutomationTextTotalsPublicRequest)
    .output(commentAutomationTextTotalsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      await findAutomationOrFail(context.workspace.id, input.automationId)
      return await commentAutomationAnalyticsService.listUserComments(
        toServiceRange(input, context.workspace.id),
      )
    }),

  commentAutomationBotReplies: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/comment-automations/{automationId}/bot-replies",
      summary: "List comment automation bot replies",
      description:
        "Lists the distinct messages one comment automation replied with, and how often each was sent, over a time range. Use `analytics.commentAutomationUserComments` for the comments that triggered them.",
      tags: ["Analytics"],
    })
    .input(commentAutomationTextTotalsPublicRequest)
    .output(commentAutomationTextTotalsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      await findAutomationOrFail(context.workspace.id, input.automationId)
      return await commentAutomationAnalyticsService.listBotReplies(
        toServiceRange(input, context.workspace.id),
      )
    }),

  commentAutomationErrors: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/comment-automations/{automationId}/errors",
      summary: "List comment automation errors",
      description:
        "Lists failed replies of one comment automation over a time range, with the provider error. Failed rows are kept for 30 days. Use `analytics.commentAutomationContacts` with `message:failed` for the contacts behind the lifetime failed counter.",
      tags: ["Analytics"],
    })
    .input(commentAutomationErrorsPublicRequest)
    .output(commentAutomationErrorsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      await findAutomationOrFail(context.workspace.id, input.automationId)
      const result = await commentAutomationAnalyticsService.listErrors(
        toServiceRange(input, context.workspace.id),
      )
      return {
        ...result,
        data: result.data.map(({ contact: _contact, ...row }) => row),
      }
    }),

  commentAutomationContacts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/comment-automations/{automationId}/contacts",
      summary: "List comment automation contacts",
      description:
        "Lists the contacts behind one of a comment automation's counters (sent, delivered, seen, clicked, failed, missed), newest event first. Get the automation id from `fbComments.list` or another channel's list first.",
      tags: ["Analytics"],
    })
    .input(commentAutomationContactsPublicRequest)
    .output(commentAutomationContactsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const automation = await findAutomationOrFail(
        workspaceId,
        input.automationId,
      )
      const result = await listCommentAutomationContacts({
        ...input,
        workspaceId,
        total: automation[commentAutomationStatCounters[input.eventType]],
      })
      return {
        ...result,
        data: result.data.map(
          ({
            firstName: _firstName,
            lastName: _lastName,
            fullName: _fullName,
            avatar: _avatar,
            ...row
          }) => row,
        ),
      }
    }),
}
