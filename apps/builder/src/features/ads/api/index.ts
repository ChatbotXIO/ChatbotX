import { adsConversionService } from "@chatbotx.io/business"
import { facebookAdAccountSchema } from "@chatbotx.io/integration-facebook-ads"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { resolveChannelAdAccountSources } from "../queries/channel-ad-accounts"
import { listChannelAdAccountsRequest } from "../schemas/channel-ad-accounts"
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

  // Super-admin only (unlike the two member-level `adsCampaignAPI` account
  // endpoints) — this powers the Ads dashboard's account filter/spend
  // fan-out, a super-admin-guarded surface end to end
  // (`resolveGuardedWorkspaceId(..., "superAdmin")` in the page).
  listChannelAdAccounts: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ads/{channel}/ad-accounts",
      summary:
        "List ad accounts for the Ads dashboard's channel — the union of every connected integration's messaging-ads connection plus the workspace-wide fallback (deduped), or one integration's own connection when integrationId is given",
      tags: ["Ads"],
    })
    .input(listChannelAdAccountsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(facebookAdAccountSchema) }))
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)

      const accounts = await resolveChannelAdAccountSources(input)
      // `sources` is internal provenance (Codex MED-5) — the response schema
      // would strip it anyway, but drop it explicitly so it's never even
      // constructed in the wire shape.
      return {
        data: accounts.map(({ sources: _sources, ...account }) => account),
      }
    }),
}
