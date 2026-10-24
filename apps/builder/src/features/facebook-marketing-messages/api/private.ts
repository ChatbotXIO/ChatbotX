import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  getMarketingMessagesAudiencesLiveStatus,
  listMarketingMessagesAdAccounts,
  listMarketingMessagesAudiences,
  listMarketingMessagesPages,
} from "../lib/read-operations"
import { getMarketingMessagesStatistics } from "../lib/statistics-operations"
import {
  adAccountsOutputSchema,
  audiencesListInputSchema,
  audiencesListOutputSchema,
  audiencesLiveOutputSchema,
  pagesOutputSchema,
} from "../schema/public"
import {
  statisticsInputSchema,
  statisticsOutputSchema,
} from "../schema/statistics"

export const facebookMarketingMessagesAuthenticatedAPI = {
  getMarketingMessagesStatisticsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-marketing-messages/statistics",
      summary: "Get Marketing Messages statistics",
      tags: ["FB Marketing Messages"],
    })
    .input(withWorkspaceIdSchema.extend(statisticsInputSchema.shape))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(statisticsOutputSchema)
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...statisticsInput } = input
      return await getMarketingMessagesStatistics(
        context.workspace,
        statisticsInput,
      )
    }),

  listMarketingMessagesPagesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-marketing-messages/pages",
      summary: "List Messenger pages available for Marketing Messages",
      tags: ["FB Marketing Messages"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(pagesOutputSchema)
    .handler(
      async ({ input }) => await listMarketingMessagesPages(input.workspaceId),
    ),

  listMarketingMessagesAdAccountsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-marketing-messages/ad-accounts",
      summary: "List ad accounts available for Marketing Messages",
      tags: ["FB Marketing Messages"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(adAccountsOutputSchema)
    .handler(
      async ({ context }) =>
        await listMarketingMessagesAdAccounts(context.workspace),
    ),

  listMarketingMessagesAudiencesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-marketing-messages/audiences",
      summary: "List Marketing Messages custom audiences",
      tags: ["FB Marketing Messages"],
    })
    .input(withWorkspaceIdSchema.extend(audiencesListInputSchema.shape))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(audiencesListOutputSchema)
    .handler(
      async ({ input }) =>
        await listMarketingMessagesAudiences(input.workspaceId, {
          adAccountId: input.adAccountId,
          pageId: input.pageId,
          readyOnly: input.readyOnly,
        }),
    ),

  listMarketingMessagesAudiencesLiveAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-marketing-messages/audiences/live",
      summary: "Live count and status of Marketing Messages custom audiences",
      tags: ["FB Marketing Messages"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(audiencesLiveOutputSchema)
    .handler(
      async ({ context }) =>
        await getMarketingMessagesAudiencesLiveStatus(context.workspace),
    ),
}
