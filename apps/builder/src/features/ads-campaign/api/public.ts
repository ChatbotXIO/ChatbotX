import {
  getCachedMessagingAdAccountDetails,
  listCachedMessagingAdAccounts,
  messagingAdCampaignService,
  messagingAdsConnectionService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { facebookAdAccountSchema } from "@chatbotx.io/integration-facebook-ads"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { ADS_CAMPAIGNS_INSIGHTS_PATH } from "../lib/api-paths"
import { getMessagingAdsContextForIntegration } from "../lib/facebook-ads-runner"
import { toMessagingAdOperationResource } from "../lib/resource-mapper"
import {
  adAccountDetailsPublicRequest,
  adAccountDetailsPublicRequestParams,
  checkPrerequisitesPublicRequest,
  createMessagingAdPublicRequest,
  listAdAccountsPublicRequest,
  listAdAccountsPublicRequestParams,
  listMessagingAdsPublicRequest,
  listMessengerPagesPublicRequest,
  messagingAdsInsightsPublicRequest,
  operationIdPublicParams,
  uploadAdVideoPublicRequest,
  videoStatusPublicRequest,
  videoStatusPublicRequestParams,
} from "../schema/public"
import {
  adAccountDetailsResource,
  messagingAdInsightResource,
  messagingAdOperationResource,
} from "../schema/resource"
import { createMessagingAdRequest } from "../schema/wizard"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ads")

const messagingAdOperationPublicResource = messagingAdOperationResource.omit({
  workspaceId: true,
})

/**
 * A read_only token must not be able to force an uncached Graph call on
 * every request — every cached Graph-backed route below (`listCampaigns`,
 * `getCampaignsInsights`, `listCampaignAdAccounts`,
 * `getCampaignAdAccountDetails`) accepts a `refresh` param, and honoring it
 * unconditionally would let a read_only caller bypass the cache at the
 * token's full rate limit on every call — the exact cost/rate surface a
 * read-only scope is meant to avoid. Only a full-permission token's
 * `refresh` is honored; a read_only caller still gets a fresh page
 * occasionally via the cache's own TTL.
 */
const resolveForceRefresh = (
  context: { apiToken?: { permission?: string } },
  refresh: boolean | undefined,
): boolean | undefined =>
  context.apiToken?.permission === "read_only" ? false : refresh

const toPublicOperationResource = (
  row: Parameters<typeof toMessagingAdOperationResource>[0],
) => {
  const { workspaceId: _workspaceId, ...resource } =
    toMessagingAdOperationResource(row)
  return resource
}

/**
 * Every campaign-lifecycle mutation below deliberately OMITS
 * `assertWorkspaceSuperAdmin` (present on the private `adsCampaignAPI` at
 * `../api/private.ts`) — that guard resolves the SESSION user via
 * `getCurrentUserAndTargetWorkspace`, and a workspace-token request has no
 * session user (`context.user` is never set on the token auth stack, see
 * `apps/builder/src/orpc.ts`). It would throw `errors.superAdminRequired` on
 * every token call. Per docs/developer/workspace-api-tokens.md, a workspace
 * token authenticates the WORKSPACE, not a member — member-level permission
 * scoping does not apply here, and minting a token already required the
 * caller to be a workspace superAdmin. `createdBy` is likewise omitted on
 * every write (a token has no associated user), matching the
 * `createdById: null` precedent in `features/coupons/api/public.ts`.
 */
export const adsCampaignPublicRouter = {
  createCampaign: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ads/campaigns",
      summary:
        "Create a messaging ad (campaign + ad set + creative + ad, all PAUSED). Created without a `createdBy` — workspace API tokens have no associated user.",
      successStatus: 201,
      tags: ["Ads"],
    })
    .input(createMessagingAdPublicRequest)
    .output(messagingAdOperationPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      // Re-validated through the private `createMessagingAdRequest` (the
      // single source of truth for this schema's rules — CREDIT rejection,
      // special-ad-category country, adSet time ordering, and the
      // imageKey-ownership refine that needs `workspaceId` in scope) after
      // merging in the token's resolved workspace. `safeParse` (not
      // `.parse`) so a rejection here is an explicit 422 we control, rather
      // than a raw `ZodError` bubbling up to the generic oRPC error handler
      // (which does not remap it and would otherwise surface a 500 for what
      // is really a client-input problem).
      const result = createMessagingAdRequest.safeParse({
        ...input,
        workspaceId: context.workspace.id,
      })
      if (!result.success) {
        throw new ORPCError("invalidRequestData", {
          message: "Input validation failed",
          status: 422,
          data: { issues: result.error.issues },
        })
      }
      const record = await messagingAdCampaignService.createDraft(result.data)
      return toPublicOperationResource({ ...record, effectiveStatus: null })
    }),

  retryCampaign: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ads/campaigns/{operationId}/retry",
      summary:
        "Resume a partially-created messaging ad using the same operationId",
      tags: ["Ads"],
    })
    .input(operationIdPublicParams)
    .output(messagingAdOperationPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const record = await messagingAdCampaignService.retryDraft({
        ...input,
        workspaceId: context.workspace.id,
      })
      return toPublicOperationResource({ ...record, effectiveStatus: null })
    }),

  publishCampaign: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ads/campaigns/{operationId}/publish",
      summary:
        "Publish a messaging ad — sets campaign/ad set/ad to ACTIVE on Meta. This spends real ad budget.",
      tags: ["Ads"],
    })
    .input(operationIdPublicParams)
    .output(messagingAdOperationPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const record = await messagingAdCampaignService.publish({
        ...input,
        workspaceId: context.workspace.id,
      })
      return toPublicOperationResource({ ...record, effectiveStatus: null })
    }),

  pauseCampaign: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ads/campaigns/{operationId}/pause",
      summary: "Pause a published messaging ad on Meta",
      tags: ["Ads"],
    })
    .input(operationIdPublicParams)
    .output(messagingAdOperationPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const record = await messagingAdCampaignService.pause({
        ...input,
        workspaceId: context.workspace.id,
      })
      return toPublicOperationResource({ ...record, effectiveStatus: null })
    }),

  deleteCampaign: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ads/campaigns/{operationId}",
      summary: "Delete a messaging ad's campaign/ad set/ad on Meta",
      tags: ["Ads"],
    })
    .input(operationIdPublicParams)
    .output(messagingAdOperationPublicResource)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const record = await messagingAdCampaignService.deleteOperation({
        ...input,
        workspaceId: context.workspace.id,
      })
      return toPublicOperationResource({ ...record, effectiveStatus: null })
    }),

  listCampaigns: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/campaigns",
      summary:
        "List messaging ads created from ChatbotX for one channel integration, with Meta's live effective_status",
      tags: ["Ads"],
    })
    .input(listMessagingAdsPublicRequest)
    .output(z.object({ data: z.array(messagingAdOperationPublicResource) }))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input: { refresh, ...input } }) => {
      const rows = await messagingAdCampaignService.list({
        ...input,
        workspaceId: context.workspace.id,
        forceRefresh: resolveForceRefresh(context, refresh),
      })
      return { data: rows.map(toPublicOperationResource) }
    }),

  getCampaignsInsights: workspaceTokenAuthAPI
    .route({
      // POST (not GET) despite being read-only — `adIds` is an array of up
      // to 500 entries, too large for a safe GET query string; mirrors the
      // private `getMessagingAdsInsights` POST-for-read precedent. A
      // read_only token can still call this: `ADS_CAMPAIGNS_INSIGHTS_PATH`
      // is allowlisted in `READ_ONLY_TOKEN_ALLOWED_POST_PATHS`
      // (`lib/workspace/authorize-workspace-access.ts`) — both sides read
      // the same constant (`../lib/api-paths`), so they cannot drift.
      method: "POST",
      path: ADS_CAMPAIGNS_INSIGHTS_PATH,
      summary:
        "Ads Insights for a set of messaging ads (impressions/reach/spend/clicks/messaging conversations started/cost-per-conversation)",
      tags: ["Ads"],
    })
    .input(messagingAdsInsightsPublicRequest)
    .output(z.object({ data: z.array(messagingAdInsightResource) }))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input: { refresh, ...input } }) => ({
      // Through the service (not the raw cached read) so ownership is
      // enforced — the requested adIds/adAccountId are intersected with this
      // workspace's own operations before any Graph call.
      data: await messagingAdCampaignService.listInsights({
        ...input,
        workspaceId: context.workspace.id,
        // Up to MAX_INSIGHTS_AD_IDS (500) ad ids per call, at up to the
        // token's own rate limit, is a real cost/rate surface even though it
        // mutates no app data — see `resolveForceRefresh`.
        forceRefresh: resolveForceRefresh(context, refresh),
      }),
    })),

  listCampaignAdAccounts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/campaigns/{channel}/{integrationId}/ad-accounts",
      summary:
        "List ad accounts reachable by one integration's messaging-ads connection (cached)",
      tags: ["Ads"],
    })
    .input(listAdAccountsPublicRequestParams.and(listAdAccountsPublicRequest))
    .output(z.object({ data: z.array(facebookAdAccountSchema) }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input: { refresh, ...input } }) => ({
      data: await listCachedMessagingAdAccounts({
        ...input,
        workspaceId: context.workspace.id,
        forceRefresh: resolveForceRefresh(context, refresh),
      }),
    })),

  getCampaignAdAccountDetails: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/campaigns/ad-accounts/{adAccountId}",
      summary:
        "Get an ad account's currency/timezone/status/minimum budget (cached)",
      tags: ["Ads"],
    })
    .input(
      adAccountDetailsPublicRequestParams.and(adAccountDetailsPublicRequest),
    )
    .output(adAccountDetailsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(({ context, input: { refresh, ...input } }) =>
      getCachedMessagingAdAccountDetails({
        ...input,
        workspaceId: context.workspace.id,
        forceRefresh: resolveForceRefresh(context, refresh),
      }),
    ),

  uploadCampaignVideo: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ads/campaigns/upload-video",
      summary:
        "Upload a creative video to Meta — returns the video_id (processing is async, poll getCampaignVideoStatus)",
      tags: ["Ads"],
    })
    .input(uploadAdVideoPublicRequest)
    .output(z.object({ videoId: z.string() }))
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { ctx, integration } = await getMessagingAdsContextForIntegration({
        ...input,
        workspaceId: context.workspace.id,
      })
      return integration.runAction("uploadMessagingAdVideo", {
        ctx,
        props: {
          adAccountId: input.adAccountId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          bytes: new Uint8Array(Buffer.from(input.base64, "base64")),
        },
      })
    }),

  getCampaignVideoStatus: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/campaigns/videos/{videoId}/status",
      summary:
        "Poll a video's processing status — a creative must not reference a not-yet-ready video",
      tags: ["Ads"],
    })
    .input(videoStatusPublicRequestParams.and(videoStatusPublicRequest))
    .output(
      z.object({
        videoId: z.string(),
        status: z.string(),
        isReady: z.boolean(),
        isError: z.boolean(),
      }),
    )
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const { ctx, integration } = await getMessagingAdsContextForIntegration({
        ...input,
        workspaceId: context.workspace.id,
      })
      return integration.runAction("getMessagingAdVideoStatus", {
        ctx,
        props: { videoId: input.videoId },
      })
    }),

  listCampaignMessengerPages: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/campaigns/messenger-pages",
      summary:
        "List connected Messenger Pages (source of page_id for the WhatsApp ad-set step) — CTWA only",
      tags: ["Ads"],
    })
    .input(listMessengerPagesPublicRequest)
    .output(
      z.object({
        data: z.array(
          z.object({ id: z.string(), name: z.string(), pageId: z.string() }),
        ),
      }),
    )
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      if (input.channel !== "whatsapp") {
        throw new ChatbotXException(
          "Messenger pages are only listed for the WhatsApp channel",
          "invalidRequest",
          400,
        )
      }
      return {
        data: await messagingAdCampaignService.listMessengerPages(
          context.workspace.id,
        ),
      }
    }),

  checkCampaignPrerequisites: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ads/campaigns/prerequisites",
      summary:
        "Whether this channel integration's messaging-ads connection is ready",
      tags: ["Ads"],
    })
    .input(checkPrerequisitesPublicRequest)
    .output(z.object({ connected: z.boolean() }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const connection = await messagingAdsConnectionService.findForIntegration(
        { ...input, workspaceId: context.workspace.id },
      )
      return {
        connected: Boolean(connection && connection.status === "active"),
      }
    }),
}
