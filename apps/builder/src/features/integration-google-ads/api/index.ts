import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { GOOGLE_ADS_PROVIDER } from "../lib/constants"
import { listGoogleAdsEventResources } from "../lib/list-google-ads-events"
import { loadGoogleAdsIntegration } from "../lib/load-google-ads-integration"
import {
  getInFlightConnectSessionRequest,
  inFlightConnectSessionResource,
  listGoogleAdsEventsRequest,
  listGoogleAdsEventsResponse,
} from "../schema/events"
import {
  getGoogleAdsIntegrationRequest,
  googleAdsIntegrationResource,
} from "../schema/integration"

export const googleAdsAPI = {
  // Read by the flow-step and trigger-action editors, so it needs workspace
  // membership only (not super admin like the settings page). The service
  // returns a credential-free projection; `auth` never reaches this layer.
  getIntegration: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/google-ads/integration",
      summary:
        "Get the workspace's Google Ads connection status, synced conversion actions and conversion data consent (no credentials)",
      tags: ["Google Ads"],
    })
    .input(getGoogleAdsIntegrationRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(googleAdsIntegrationResource)
    .handler(({ input }) => loadGoogleAdsIntegration(input.workspaceId)),

  // Super admin only: the settings page resumes the account picker from this
  // after the OAuth round-trip. Returns id + status only; the picker then
  // reads the session through the generic connections API.
  getInFlightConnectSession: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/google-ads/connect-session",
      summary:
        "Get the workspace's in-flight Google Ads connect session (id and status only)",
      tags: ["Google Ads"],
    })
    .input(getInFlightConnectSessionRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(inFlightConnectSessionResource)
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)
      const session = await connectSessionService.findLatestInFlightByProvider({
        workspaceId: input.workspaceId,
        provider: GOOGLE_ADS_PROVIDER,
      })
      return {
        session: session ? { id: session.id, status: session.status } : null,
      }
    }),

  listEvents: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/google-ads/events",
      summary:
        "List the workspace's Google Ads conversion events (click ids masked)",
      tags: ["Google Ads"],
    })
    .input(listGoogleAdsEventsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listGoogleAdsEventsResponse)
    .handler(async ({ input }) => {
      await assertWorkspaceSuperAdmin(input.workspaceId)
      const { data, total, perPage } = await listGoogleAdsEventResources(input)
      return { data, total, page: input.page, perPage }
    }),
}
