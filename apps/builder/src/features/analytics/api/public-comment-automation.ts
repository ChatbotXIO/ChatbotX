import { commentAutomationService } from "@chatbotx.io/business"
import { listCommentAutomationContacts } from "@/features/shared/comment-automation/lib/list-automation-contacts"
import { commentAutomationStatCounters } from "@/features/shared/comment-automation/lib/stat-counters"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  commentAutomationContactsPublicRequest,
  commentAutomationContactsPublicResponse,
} from "../schema/public-comment-automation"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("analytics")

export const commentAutomationAnalyticsPublicRouter = {
  commentAutomationContacts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/analytics/comment-automation/contacts",
      summary: "List comment automation contacts",
      description:
        "Lists the contacts behind one of a comment automation's lifetime counters (sent, delivered, seen, clicked, failed, missed), newest event first. Use `analytics.commentAutomationReplyStats` for counts over a time range.",
      tags: ["Analytics"],
    })
    .input(commentAutomationContactsPublicRequest)
    .output(commentAutomationContactsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      // 404 for a foreign id (the stats service would answer empty), and the
      // row carries the counter that is this list's total.
      const automation = await commentAutomationService.findOrFail({
        workspaceId,
        id: input.automationId,
      })
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
