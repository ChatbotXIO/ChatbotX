import { listAutomationAccounts } from "@chatbotx.io/business"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  getModerationSummary,
  listModerationLogs,
} from "../lib/moderation-logs"
import {
  listAutomationAccountsRequest,
  listAutomationAccountsResponse,
} from "../schema/account"
import {
  listModerationLogsPrivateResponse,
  listModerationLogsRequest,
  moderationLogFilterSchema,
  moderationSummaryResponse,
} from "../schema/moderation-log"

export const commentAutomationsPrivateAPI = {
  automationAccountsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/comment-automations/accounts",
      summary: "List comment automation accounts",
      tags: ["Comment Automations"],
    })
    .input(listAutomationAccountsRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAutomationAccountsResponse)
    .handler(async ({ input }) => ({
      accounts: await listAutomationAccounts({
        workspaceId: input.workspaceId,
        type: input.type,
      }),
    })),

  moderationLogsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/comment-automations/{id}/moderation-logs",
      summary: "List moderated comments",
      tags: ["Comment Automations"],
    })
    .input(listModerationLogsRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listModerationLogsPrivateResponse)
    .handler(
      async ({ input }) => await listModerationLogs(input.workspaceId, input),
    ),

  moderationSummaryAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/comment-automations/{id}/moderation-summary",
      summary: "Get moderated comments summary",
      tags: ["Comment Automations"],
    })
    .input(moderationLogFilterSchema.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(moderationSummaryResponse)
    .handler(
      async ({ input }) => await getModerationSummary(input.workspaceId, input),
    ),
}
