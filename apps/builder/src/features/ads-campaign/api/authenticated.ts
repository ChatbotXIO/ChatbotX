import {
  getCachedMessagingAdAccountDetails,
  listCachedMessagingAdAccounts,
  messagingAdCampaignService,
  messagingAdsConnectionService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { facebookAdAccountSchema } from "@chatbotx.io/integration-facebook-ads"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getMessagingAdsContextForIntegration } from "../lib/facebook-ads-runner"
import { toMessagingAdOperationResource } from "../lib/resource-mapper"
import {
  adAccountDetailsResource,
  messagingAdInsightResource,
  messagingAdOperationResource,
} from "../schema/resource"
import {
  adAccountDetailsRequest,
  checkPrerequisitesRequest,
  createMessagingAdRequest,
  listAdAccountsRequest,
  listMessengerPagesRequest,
  messagingAdChannelSchema,
  messagingAdsInsightsRequest,
  operationIdParamsSchema,
  uploadAdImageRequest,
  uploadAdVideoRequest,
  videoStatusRequest,
} from "../schema/wizard"

const listMessagingAdsResponse = z.object({
  data: z.array(messagingAdOperationResource),
})

export const adsCampaignAuthenticatedAPI = {
  createMessagingAd: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ads-campaign/messaging-ads",
      summary:
        "Create a messaging ad (campaign + ad set + creative + ad, all PAUSED)",
      tags: ["AdsCampaign"],
    })
    .input(createMessagingAdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(messagingAdOperationResource)
    .handler(async ({ input, context }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)
      const record = await messagingAdCampaignService.createDraft({
        ...input,
        createdBy: context.user?.id,
      })
      return toMessagingAdOperationResource({
        ...record,
        effectiveStatus: null,
      })
    }),

  retryMessagingAd: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ads-campaign/messaging-ads/{operationId}/retry",
      summary:
        "Retry a partially-created messaging ad (resumes the same operation)",
      tags: ["AdsCampaign"],
    })
    .input(operationIdParamsSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(messagingAdOperationResource)
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)
      const record = await messagingAdCampaignService.retryDraft(input)
      return toMessagingAdOperationResource({
        ...record,
        effectiveStatus: null,
      })
    }),

  publishMessagingAd: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ads-campaign/messaging-ads/{operationId}/publish",
      summary:
        "Publish a messaging ad — activates campaign -> ad set -> ad in order",
      tags: ["AdsCampaign"],
    })
    .input(operationIdParamsSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(messagingAdOperationResource)
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)
      const record = await messagingAdCampaignService.publish(input)
      return toMessagingAdOperationResource({
        ...record,
        effectiveStatus: null,
      })
    }),

  pauseMessagingAd: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ads-campaign/messaging-ads/{operationId}/pause",
      summary: "Pause a messaging ad — stops delivery at every level",
      tags: ["AdsCampaign"],
    })
    .input(operationIdParamsSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(messagingAdOperationResource)
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)
      const record = await messagingAdCampaignService.pause(input)
      return toMessagingAdOperationResource({
        ...record,
        effectiveStatus: null,
      })
    }),

  deleteMessagingAd: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/ads-campaign/messaging-ads/{operationId}",
      summary: "Delete a messaging ad (best-effort archive at every level)",
      tags: ["AdsCampaign"],
    })
    .input(operationIdParamsSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(messagingAdOperationResource)
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)
      const record = await messagingAdCampaignService.deleteOperation(input)
      return toMessagingAdOperationResource({
        ...record,
        effectiveStatus: null,
      })
    }),

  listMessagingAds: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ads-campaign/messaging-ads",
      summary:
        "List messaging ads created from ChatbotX for one channel integration, with Meta's live effective_status",
      tags: ["AdsCampaign"],
    })
    .input(
      z.object({
        workspaceId: z.string(),
        channel: messagingAdChannelSchema,
        integrationId: z.string(),
        /** Box "Refresh" → force a live Meta re-read instead of the stale cache. */
        refresh: z.boolean().optional(),
      }),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listMessagingAdsResponse)
    .handler(async ({ input: { refresh, ...input } }) => {
      const rows = await messagingAdCampaignService.list({
        ...input,
        forceRefresh: refresh,
      })
      return { data: rows.map(toMessagingAdOperationResource) }
    }),

  getMessagingAdsInsights: authorizedAPI
    .route({
      // POST (not GET) despite being read-only — `adIds` is an array, and this
      // codebase's GET/query-string OpenAPI codec is only exercised for
      // primitive fields elsewhere (see `listContactsByPOSTAuthenticatedAPI`
      // for the same POST-for-read precedent with array/object input).
      method: "POST",
      path: "/workspaces/{workspaceId}/ads-campaign/messaging-ads/insights",
      summary:
        "Ads Insights for a set of messaging ads (impressions/reach/spend/clicks/messaging conversations started/cost-per-conversation) — a SEPARATE, cached read from listMessagingAds so the list stays fast",
      tags: ["AdsCampaign"],
    })
    .input(messagingAdsInsightsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(messagingAdInsightResource) }))
    .handler(async ({ input: { refresh, ...input } }) => ({
      // Through the service (not the raw cached read) so ownership is enforced:
      // the requested adIds/adAccountId are intersected with THIS workspace's
      // own operations before any Graph call — never trust caller-supplied ids.
      data: await messagingAdCampaignService.listInsights({
        ...input,
        forceRefresh: refresh,
      }),
    })),

  listAdAccounts: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ads-campaign/{channel}/{integrationId}/ad-accounts",
      summary:
        "List ad accounts reachable by one integration's messaging-ads connection (cached)",
      tags: ["AdsCampaign"],
    })
    .input(listAdAccountsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(facebookAdAccountSchema) }))
    .handler(async ({ input: { refresh, ...input } }) => ({
      data: await listCachedMessagingAdAccounts({
        ...input,
        forceRefresh: refresh,
      }),
    })),

  getAdAccountDetails: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ads-campaign/ad-accounts/{adAccountId}",
      summary:
        "Get an ad account's currency/timezone/status/minimum budget (cached)",
      tags: ["AdsCampaign"],
    })
    .input(adAccountDetailsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(adAccountDetailsResource)
    .handler(({ input: { refresh, ...input } }) =>
      getCachedMessagingAdAccountDetails({ ...input, forceRefresh: refresh }),
    ),

  uploadAdImage: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ads-campaign/upload-image",
      summary: "Upload a creative image to Meta — returns the image_hash",
      tags: ["AdsCampaign"],
    })
    .input(uploadAdImageRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ imageHash: z.string() }))
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)
      const { ctx, integration } =
        await getMessagingAdsContextForIntegration(input)
      return integration.runAction("uploadMessagingAdImage", {
        ctx,
        props: {
          adAccountId: input.adAccountId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          bytes: new Uint8Array(Buffer.from(input.base64, "base64")),
        },
      })
    }),

  uploadAdVideo: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ads-campaign/upload-video",
      summary:
        "Upload a creative video to Meta — returns the video_id (processing is async, poll getAdVideoStatus)",
      tags: ["AdsCampaign"],
    })
    .input(uploadAdVideoRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ videoId: z.string() }))
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)
      const { ctx, integration } =
        await getMessagingAdsContextForIntegration(input)
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

  getAdVideoStatus: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ads-campaign/videos/{videoId}/status",
      summary:
        "Poll a video's processing status — a creative must not reference a not-yet-ready video",
      tags: ["AdsCampaign"],
    })
    .input(videoStatusRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        videoId: z.string(),
        status: z.string(),
        isReady: z.boolean(),
        isError: z.boolean(),
      }),
    )
    .handler(async ({ input }) => {
      const { ctx, integration } =
        await getMessagingAdsContextForIntegration(input)
      return integration.runAction("getMessagingAdVideoStatus", {
        ctx,
        props: { videoId: input.videoId },
      })
    }),

  listMessengerPages: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ads-campaign/messenger-pages",
      summary:
        "List connected Messenger Pages (source of page_id for the WhatsApp ad-set step) — CTWA only, a DB read that never builds a Facebook Ads context",
      tags: ["AdsCampaign"],
    })
    .input(listMessengerPagesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        data: z.array(
          z.object({ id: z.string(), name: z.string(), pageId: z.string() }),
        ),
      }),
    )
    .handler(async ({ input }) => {
      // v3 correction #3: this endpoint is a DB read only (source of page_id
      // for the CTWA wizard step) — it must never build a Facebook Ads
      // context, and is only meaningful for the WhatsApp box.
      if (input.channel !== "whatsapp") {
        throw new ChatbotXException(
          "Messenger pages are only listed for the WhatsApp channel",
          "invalidRequest",
          400,
        )
      }
      return {
        data: await messagingAdCampaignService.listMessengerPages(
          input.workspaceId,
        ),
      }
    }),

  checkPrerequisites: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ads-campaign/prerequisites",
      summary:
        "Whether this channel integration's messaging-ads connection is ready for the wizard",
      tags: ["AdsCampaign"],
    })
    .input(checkPrerequisitesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ connected: z.boolean() }))
    .handler(async ({ input }) => {
      const connection =
        await messagingAdsConnectionService.findForIntegration(input)
      return {
        connected: Boolean(connection && connection.status === "active"),
      }
    }),
}
