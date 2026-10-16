import { listAutomationAccounts } from "@chatbotx.io/business"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listAutomationAccountsRequest,
  listAutomationAccountsResponse,
} from "../schema/account"

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
}
