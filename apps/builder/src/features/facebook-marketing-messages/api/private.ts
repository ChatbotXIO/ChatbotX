import { messengerIntegrationService } from "@chatbotx.io/business"
import { getMarketingMessagesAdAccounts } from "@chatbotx.io/integration-facebook-ads"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { toAdAccountOption } from "../lib/ad-account-option"
import { requireValidGrant } from "../lib/grant"

const adAccountOptionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  currency: z.string(),
  tosAccepted: z.boolean(),
  tosUrl: z.string(),
})

export const facebookMarketingMessagesAuthenticatedAPI = {
  listMarketingMessagesPagesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-marketing-messages/pages",
      summary: "List Messenger pages available for Marketing Messages",
      tags: ["FB Marketing Messages"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        pages: z.array(z.object({ pageId: z.string(), name: z.string() })),
      }),
    )
    .handler(async ({ input }) => {
      const integrations = await messengerIntegrationService.findByWorkspaceId(
        input.workspaceId,
      )
      return {
        pages: integrations.map((integration) => ({
          pageId: integration.pageId,
          name: integration.name,
        })),
      }
    }),

  listMarketingMessagesAdAccountsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-marketing-messages/ad-accounts",
      summary: "List ad accounts available for Marketing Messages",
      tags: ["FB Marketing Messages"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ accounts: z.array(adAccountOptionSchema) }))
    .handler(async ({ context }) => {
      const grant = await requireValidGrant(context.workspace)
      const accounts = await getMarketingMessagesAdAccounts(
        grant.accessToken,
        grant.version,
      )
      return { accounts: accounts.map(toAdAccountOption) }
    }),
}
