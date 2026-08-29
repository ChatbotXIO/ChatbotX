import { inboxService } from "@chatbotx.io/business"
import {
  type AdsEligibleChannelType,
  adsEligibleChannelTypes,
} from "@chatbotx.io/utils/channel"

/**
 * Which Ads Analytics nav entries (`AnalyticsNav`) a workspace should see.
 *
 * Only superAdmins ever see the Ads section, and within it only the
 * ads-eligible channels the workspace has actually connected (an inbox row
 * with `status: "connected"`) — the same `inboxService.distinctConnectedChannels`
 * call the settings surface uses to derive "has this channel" (see AGENTS.md
 * invariant 18). Order follows `adsEligibleChannelTypes.options`, the
 * canonical eligible-channel order.
 */
export async function resolveAdsDashboardChannels(input: {
  workspaceId: string
  isSuperAdmin: boolean
}): Promise<AdsEligibleChannelType[]> {
  if (!input.isSuperAdmin) {
    return []
  }

  const connected = await inboxService.distinctConnectedChannels(
    input.workspaceId,
  )

  return adsEligibleChannelTypes.options.filter((channel) =>
    connected.includes(channel),
  )
}
