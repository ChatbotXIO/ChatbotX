import {
  facebookAdAccountSchema,
  integration as facebookAdsIntegration,
  facebookCustomAudienceSchema,
} from "@chatbotx.io/integration-facebook-ads"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getFacebookAdsContext } from "../queries"

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
      const ctx = await getFacebookAdsContext(input.workspaceId)
      return {
        data: await facebookAdsIntegration.runAction("getAdAccounts", { ctx }),
      }
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
    .handler(async ({ input }) => {
      const ctx = await getFacebookAdsContext(input.workspaceId)
      return {
        data: await facebookAdsIntegration.runAction("getCustomAudiences", {
          ctx,
          props: { adAccountId: input.adAccountId },
        }),
      }
    }),
}
