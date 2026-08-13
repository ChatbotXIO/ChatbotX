import { adsConversionService } from "@chatbotx.io/business"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listAdsConversionRulesRequest,
  listAdsConversionRulesResponse,
} from "../schemas/conversion-rule"

export const adsAPI = {
  listRules: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ads/conversion-rules",
      summary: "List Ads conversion rules",
      tags: ["Ads"],
    })
    .input(listAdsConversionRulesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAdsConversionRulesResponse)
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)

      return {
        data: await adsConversionService.list(input),
      }
    }),
}
