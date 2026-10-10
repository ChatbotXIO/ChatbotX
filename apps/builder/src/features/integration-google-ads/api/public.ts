import {
  googleAdsConversionService,
  googleAdsStatsResponse,
} from "@chatbotx.io/business"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listGoogleAdsEventResources } from "../lib/list-google-ads-events"
import { loadGoogleAdsIntegration } from "../lib/load-google-ads-integration"
import { googleAdsIntegrationResource } from "../schema/integration"
import {
  getGoogleAdsStatsPublicRequest,
  listGoogleAdsEventsPublicRequest,
  listGoogleAdsEventsPublicResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ads")

// Read-only on purpose: recording, retrying, connecting and consent changes
// stay in the settings UI, where the click, timing and identity rules apply.
export const googleAdsPublicRouter = {
  getStats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/google-ads/stats",
      summary: "Get Google Ads conversion statistics",
      description:
        "Counts conversions sent to Google Ads per status, day, conversion action and channel, plus the confirmed value per currency. Days are the time the conversion happened, not when it was recorded; `processed` means Google confirmed it, `sent` is still being processed by Google. Invalid, inverted or oversized ranges are normalised (max 366 days) and the range used is returned. Use `googleAds.listEvents` for individual events.",
      tags: ["Google Ads"],
    })
    .input(getGoogleAdsStatsPublicRequest)
    .output(googleAdsStatsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(({ context, input }) =>
      googleAdsConversionService.getStats({
        ...input,
        workspaceId: context.workspace.id,
      }),
    ),

  listEvents: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/google-ads/events",
      summary: "List Google Ads conversion events",
      description:
        "Newest conversion first. Click IDs are masked, and click, transaction and request IDs are redacted from `error`. `identity.id` is the order or event ID the flow sent and can contain customer data. Use `googleAds.getStats` for totals.",
      tags: ["Google Ads"],
    })
    .input(listGoogleAdsEventsPublicRequest)
    .output(listGoogleAdsEventsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, total, perPage } = await listGoogleAdsEventResources({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data, pageCount: Math.max(1, Math.ceil(total / perPage)) }
    }),

  getConnection: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/google-ads/connection",
      summary: "Get Google Ads connection",
      description:
        "Connection status, upload method, conversion data consent and the synced conversion actions. Use an action `id` as `conversionActionId` in a flow step or an events/stats filter. Not connected returns `connected: false` with no actions; credentials are never returned.",
      tags: ["Google Ads"],
    })
    .output(googleAdsIntegrationResource)
    .errors(possibleErrorsOnListingResource)
    .handler(({ context }) => loadGoogleAdsIntegration(context.workspace.id)),
}
