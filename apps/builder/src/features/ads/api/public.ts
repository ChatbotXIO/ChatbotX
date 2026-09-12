import { adsConversionService } from "@chatbotx.io/business"
import { z } from "zod"
import { adsCampaignPublicRouter } from "@/features/ads-campaign/api/public"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { paginateInMemory } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { resolveChannelAdAccountSources } from "../queries/channel-ad-accounts"
import {
  adsConversionRuleIdParams,
  adsConversionRulePublicResource,
  capiDeliverySummaryPublicResponse,
  createAdsConversionRulePublicRequest,
  ctwaFunnelPublicResponse,
  ctwaFunnelTimeseriesPublicResponse,
  getCtwaFunnelPublicRequest,
  listAdsConversionExportRowsPublicRequest,
  listAdsConversionExportRowsPublicResponse,
  listAdsConversionRulesPublicRequest,
  listChannelAdAccountsPublicRequest,
  listChannelAdAccountsPublicRequestParams,
  listChannelAdAccountsPublicResponse,
  toggleAdsConversionRulePublicRequest,
  updateAdsConversionRulePublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ads")

const adsConversionRulesPublicRouter = {
  listRules: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/conversion-rules",
      summary: "List Ads conversion rules",
      tags: ["Ads"],
    })
    .input(listAdsConversionRulesPublicRequest)
    .output(
      z.object({
        data: z.array(adsConversionRulePublicResource),
        pageCount: z.number().int(),
      }),
    )
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input: { page, perPage, ...input } }) => {
      const rules = await adsConversionService.list({
        ...input,
        workspaceId: context.workspace.id,
      })
      return paginateInMemory(rules, { page, perPage })
    }),

  getRule: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/conversion-rules/{id}",
      summary: "Get an Ads conversion rule",
      tags: ["Ads"],
    })
    .input(adsConversionRuleIdParams)
    .output(adsConversionRulePublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      adsConversionService.findOrFail({
        id: input.id,
        workspaceId: context.workspace.id,
      }),
    ),

  createRule: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ads/conversion-rules",
      summary: "Create an Ads conversion rule",
      successStatus: 201,
      tags: ["Ads"],
    })
    .input(createAdsConversionRulePublicRequest)
    .output(adsConversionRulePublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) =>
      adsConversionService.create({
        ...input,
        workspaceId: context.workspace.id,
      }),
    ),

  updateRule: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/ads/conversion-rules/{id}",
      summary: "Update an Ads conversion rule",
      tags: ["Ads"],
    })
    .input(adsConversionRuleIdParams.and(updateAdsConversionRulePublicRequest))
    .output(adsConversionRulePublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      adsConversionService.update({
        ...input,
        workspaceId: context.workspace.id,
      }),
    ),

  toggleRuleStatus: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/ads/conversion-rules/{id}/status",
      summary: "Enable or disable an Ads conversion rule",
      tags: ["Ads"],
    })
    .input(adsConversionRuleIdParams.and(toggleAdsConversionRulePublicRequest))
    .output(adsConversionRulePublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      adsConversionService.toggleEnabled({
        ...input,
        workspaceId: context.workspace.id,
      }),
    ),

  deleteRule: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ads/conversion-rules/{id}",
      summary: "Delete an Ads conversion rule",
      successStatus: 204,
      tags: ["Ads"],
    })
    .input(adsConversionRuleIdParams)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await adsConversionService.remove({
        id: input.id,
        workspaceId: context.workspace.id,
      })
    }),
}

const adsAnalyticsPublicRouter = {
  getFunnel: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/funnel",
      summary:
        "Get the CTWA/CTM/CTID conversion funnel (conversations/leads/purchases/revenue) per ad",
      tags: ["Ads"],
    })
    .input(getCtwaFunnelPublicRequest)
    .output(ctwaFunnelPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) =>
      adsConversionService.getCtwaFunnel({
        ...input,
        workspaceId: context.workspace.id,
      }),
    ),

  getFunnelTimeseries: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/funnel/timeseries",
      summary: "Get the CTWA/CTM/CTID conversion funnel, bucketed per day",
      tags: ["Ads"],
    })
    .input(getCtwaFunnelPublicRequest)
    .output(ctwaFunnelTimeseriesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => ({
      data: await adsConversionService.getCtwaFunnelTimeseries({
        ...input,
        workspaceId: context.workspace.id,
      }),
    })),

  getCapiDelivery: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/capi-delivery",
      summary:
        "Get the Conversions API delivery status breakdown (sent/pending/failed/skipped)",
      tags: ["Ads"],
    })
    .input(getCtwaFunnelPublicRequest)
    .output(capiDeliverySummaryPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) =>
      adsConversionService.getCapiDeliverySummary({
        ...input,
        workspaceId: context.workspace.id,
      }),
    ),

  listConversionExportRows: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/conversions/export",
      summary:
        "Cursor-paginated conversion/lead/purchase rows for export (contact-level — a workspace token sees unmasked contact data, see docs/developer/workspace-api-tokens.md)",
      tags: ["Ads"],
    })
    .input(listAdsConversionExportRowsPublicRequest)
    .output(listAdsConversionExportRowsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { allChannels, ...rest } = input
      const { rows, hasMore } = allChannels
        ? await adsConversionService.listAllChannelExportRows({
            ...rest,
            workspaceId: context.workspace.id,
          })
        : await adsConversionService.listExportRows({
            ...rest,
            workspaceId: context.workspace.id,
          })
      return {
        data: rows,
        // `hasMore` comes from the repository's own over-fetch (see
        // `listExportSegmentRows`), not `rows.length === input.limit` — the
        // repository is the only layer that knows whether another page
        // exists independent of how many rows this page happened to return.
        nextAfterId: hasMore ? (rows.at(-1)?.id ?? null) : null,
      }
    }),

  listChannelAdAccounts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/{channel}/ad-accounts",
      summary:
        "List ad accounts for a channel — the union of every connected integration's messaging-ads connection plus the workspace-wide fallback (deduped), or one integration's own connection when integrationId is given",
      tags: ["Ads"],
    })
    .input(
      listChannelAdAccountsPublicRequestParams.extend(
        listChannelAdAccountsPublicRequest.shape,
      ),
    )
    .output(listChannelAdAccountsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const accounts = await resolveChannelAdAccountSources({
        ...input,
        workspaceId: context.workspace.id,
      })
      // `sources` is internal provenance — never put it on the wire.
      return {
        data: accounts.map(({ sources: _sources, ...account }) => account),
      }
    }),
}

export const adsPublicRouter = {
  ...adsConversionRulesPublicRouter,
  ...adsAnalyticsPublicRouter,
  ...adsCampaignPublicRouter,
}
