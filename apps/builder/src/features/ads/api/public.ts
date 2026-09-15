import {
  adsAnalyticsService,
  adsConversionService,
  adsRetargetService,
  getCachedCustomAudiences,
  resolveChannelAdAccountSources,
} from "@chatbotx.io/business"
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
import {
  adsAnalyticsOverviewPublicResponse,
  adsAnalyticsPublicRequest,
  adsAnalyticsTimeseriesPublicResponse,
  adsConversionEventIdParams,
  adsConversionEventPublicResource,
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
  listCustomAudiencesPublicRequest,
  listCustomAudiencesPublicResponse,
  startRetargetAudienceSyncPublicRequest,
  startRetargetAudienceSyncPublicResponse,
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
      summary: "Get ad conversion funnel",
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
      summary: "Get daily ad conversion funnel",
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
      summary: "Get Conversions API delivery",
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
      summary: "Export conversion rows",
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
      summary: "List channel ad accounts",
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

  getAnalyticsOverview: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/analytics/overview",
      summary: "Get ad analytics overview",
      tags: ["Ads"],
    })
    .input(adsAnalyticsPublicRequest)
    .output(adsAnalyticsOverviewPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) =>
      adsAnalyticsService.getOverview({
        ...input,
        workspaceId: context.workspace.id,
      }),
    ),

  getAnalyticsTimeseries: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/analytics/timeseries",
      summary: "Get daily ad analytics",
      tags: ["Ads"],
    })
    .input(adsAnalyticsPublicRequest)
    .output(adsAnalyticsTimeseriesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => ({
      data: await adsAnalyticsService.getTimeseries({
        ...input,
        workspaceId: context.workspace.id,
      }),
    })),

  getConversion: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/conversions/{id}",
      summary: "Get a single Ads conversion event",
      tags: ["Ads"],
    })
    .input(adsConversionEventIdParams)
    .output(adsConversionEventPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      adsConversionService.findWorkspaceEventOrFail({
        id: input.id,
        workspaceId: context.workspace.id,
      }),
    ),

  listCustomAudiences: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/custom-audiences",
      summary: "List custom audiences",
      tags: ["Ads"],
    })
    .input(listCustomAudiencesPublicRequest)
    .output(listCustomAudiencesPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      data: await getCachedCustomAudiences({
        workspaceId: context.workspace.id,
        adAccountId: input.adAccountId,
      }),
    })),

  // `successStatus: 202` — the sync itself runs in the worker. A
  // `read_only` token is already rejected for POST unless the path is in
  // `READ_ONLY_TOKEN_ALLOWED_POST_PATHS`
  // (`@/lib/workspace/authorize-workspace-access`), and this path is
  // deliberately NOT added there.
  startRetargetAudienceSync: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ads/retarget-audiences",
      summary: "Sync retarget audience",
      successStatus: 202,
      tags: ["Ads"],
    })
    .input(startRetargetAudienceSyncPublicRequest)
    .output(startRetargetAudienceSyncPublicResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) =>
      adsRetargetService.startAudienceSync({
        ...input,
        workspaceId: context.workspace.id,
      }),
    ),
}

export const adsPublicRouter = {
  ...adsConversionRulesPublicRouter,
  ...adsAnalyticsPublicRouter,
  ...adsCampaignPublicRouter,
}
