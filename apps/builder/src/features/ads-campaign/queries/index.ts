import { messagingAdsConnectionService } from "@chatbotx.io/business"
import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import { logger } from "@/lib/log"

/**
 * Per-integration connection state for one channel's messaging-ads box —
 * replaces the workspace-only `checkAdsCampaignPrerequisites` (v3 correction
 * #5): a workspace with N WhatsApp numbers/Messenger Pages/Instagram
 * accounts can have a DIFFERENT connection state for each one, since auth is
 * per-integration (out/plan/ctwa-ctm-ctid-box-merge.md "Auth =
 * per-integration"), not workspace-wide.
 *
 * Fail-soft: this is rendered as ONE box inside the shared "Ads Optimization"
 * (CAPI) page, which also hosts conversion tracking. A failure resolving the
 * box's connection (e.g. the connection table not yet migrated, or a transient
 * DB error) must degrade the box to its "not connected" state, never take down
 * the whole page.
 */
export async function checkMessagingAdsConnectionState(input: {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
}): Promise<{ connected: boolean; reconnectNeeded: boolean }> {
  try {
    const connection =
      await messagingAdsConnectionService.findForIntegration(input)
    return {
      connected: connection?.status === "active",
      reconnectNeeded: Boolean(connection) && connection?.status !== "active",
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        channel: input.channel,
        integrationId: input.integrationId,
      },
      "Failed to resolve messaging-ads connection state; degrading box to not-connected",
    )
    return { connected: false, reconnectNeeded: false }
  }
}
