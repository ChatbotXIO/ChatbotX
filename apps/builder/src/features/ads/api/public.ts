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
      description:
        "Use this to find conversion rule ids before inspecting one with `ads.getRule` or changing one with `ads.updateRule`. Returns rules configured in this workspace.",
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
      summary: "Get Ads conversion rule",
      description:
        "Returns one conversion rule's configuration. Use `ads.listRules` to find its id first.",
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
      summary: "Create Ads conversion rule",
      description:
        "Adds a rule mapping a channel event to a conversion. Use `ads.listRules` first to avoid duplicating an existing rule.",
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
      method: "PATCH",
      path: "/v1/ads/conversion-rules/{id}",
      summary: "Update Ads conversion rule",
      description:
        "Changes an existing conversion rule's configuration. Fields omitted from the body are left unchanged. This is also how a rule is enabled or disabled: pass `enabled` on its own to toggle status without touching other fields. Call `ads.getRule` to inspect current values first.",
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

  // Deprecated — use `ads.updateRule` instead. Kept for backward
  // compatibility with the pre-consolidation `PUT` method on this path;
  // hidden from MCP/CLI tool listings.
  updateRuleLegacy: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/ads/conversion-rules/{id}",
      summary: "Update Ads conversion rule",
      description:
        "Deprecated — this route used PUT to replace the whole rule; use `ads.updateRule` (PATCH) instead, which leaves omitted fields unchanged.",
      tags: ["Ads"],
      deprecated: true,
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

  // Deprecated — use `ads.updateRule` with just `enabled` instead. Kept for
  // backward compatibility with the pre-consolidation `/status` path;
  // hidden from MCP/CLI tool listings.
  toggleRuleStatus: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/ads/conversion-rules/{id}/status",
      summary: "Enable or disable Ads conversion rule",
      description:
        "Deprecated — toggling status is now just `ads.updateRule` with only `enabled` in the body; this dedicated `/status` route no longer exists on the canonical surface.",
      deprecated: true,
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
      summary: "Delete Ads conversion rule",
      description:
        "Permanently deletes a conversion rule. Use `ads.listRules` to find its id first.",
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
      description:
        "Returns aggregate CTWA/CTM/CTID conversion funnel counts (conversations, leads, purchases, revenue) for one ad. Use `ads.getFunnelTimeseries` for a daily breakdown instead.",
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
      description:
        "Returns the same conversion funnel as `ads.getFunnel`, bucketed per day for charting a trend.",
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
      description:
        "Returns the Conversions API delivery status breakdown (sent, pending, failed, skipped) for one ad's events.",
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
      description:
        "Returns cursor-paginated conversion/lead/purchase rows for export, contact-level. A workspace token sees unmasked contact data.",
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
      description:
        "Lists ad accounts connected for a channel — every connected integration's ads connection plus the workspace-wide fallback, deduped. Pass `integrationId` to scope to one integration's own connection.",
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
      description:
        "Returns merged ads analytics (funnel plus channel spend/ROAS/CPM) for one ad, channel, account, and date range. Requires a connected ads account; use `ads.getFunnel` for a DB-only funnel without spend data.",
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
      description:
        "Returns the same merged ads analytics as `ads.getAnalyticsOverview`, bucketed per day for charting a trend.",
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
      summary: "Get Ads conversion event",
      description:
        "Returns one conversion event's full detail. Use `ads.listConversionExportRows` to find its id first.",
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
      description:
        "Cached from the connected ad account for a fixed period. Use `ads.listChannelAdAccounts` to find `adAccountId` first.",
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
      description:
        "Queues an async sync of a retargeting audience to the ad platform. Returns immediately; the sync runs in the background.",
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
