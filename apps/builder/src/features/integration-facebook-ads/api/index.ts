import {
  facebookAdAccountSchema,
  facebookAdInsightSchema,
  facebookCustomAudienceSchema,
} from "@chatbotx.io/integration-facebook-ads"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  getCachedAdAccounts,
  getCachedAdInsights,
  getCachedCustomAudiences,
  getFacebookAdsContext,
} from "../queries"

const workspaceInput = z.object({ workspaceId: zodBigintAsString() })

export const integrationFacebookAdsAPI = {
  listAdAccounts: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/facebook-ads/ad-accounts",
      summary: "List Facebook ad accounts",
      tags: ["FacebookAds"],
    })
    .input(workspaceInput)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(facebookAdAccountSchema) }))
    .handler(async ({ input }) => {
      const adAccounts = await getCachedAdAccounts(input.workspaceId)
      return { data: adAccounts }
    }),

  listCustomAudiences: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/facebook-ads/custom-audiences",
      summary: "List custom audiences of a Facebook ad account",
      tags: ["FacebookAds"],
    })
    .input(workspaceInput.extend({ adAccountId: z.string().trim().min(1) }))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(facebookCustomAudienceSchema) }))
    .handler(async ({ input }) => ({
      data: await getCachedCustomAudiences({
        workspaceId: input.workspaceId,
        adAccountId: input.adAccountId,
      }),
    })),

  getAdInsights: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/facebook-ads/ad-insights",
      summary: "Get Facebook ad insights",
      tags: ["FacebookAds"],
    })
    .input(
      workspaceInput.extend({
        adAccountId: z.string().trim().min(1),
        since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(facebookAdInsightSchema) }))
    .handler(async ({ input }) => ({
      data: await getCachedAdInsights({
        workspaceId: input.workspaceId,
        adAccountId: input.adAccountId,
        since: input.since,
        until: input.until,
        getContext: () => getFacebookAdsContext(input.workspaceId),
      }),
    })),
}
