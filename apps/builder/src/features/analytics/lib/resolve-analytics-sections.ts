import "server-only"

import { resolveAdsDashboardChannels } from "./ads-dashboard-channels"
import {
  type AnalyticsSectionOption,
  visibleAnalyticsSections,
} from "./analytics-sections"
import { resolveGoogleAdsDashboardEntry } from "./google-ads-dashboard-entry"

type AnalyticsSectionPermissions = {
  analytics: boolean
  superAdmin: boolean
}

/**
 * The sections a member sees in the Analytics section select. Contacts,
 * Conversations and Posts need `analytics`; the ads sections additionally need
 * `superAdmin` and the workspace to have the channel (or a Google Ads
 * connection / history). A deep link to an authorized section the list leaves
 * out (a since-disconnected ads channel) is appended by the select itself.
 */
export async function resolveAnalyticsSections(input: {
  workspaceId: string
  permissions: AnalyticsSectionPermissions
}): Promise<AnalyticsSectionOption[]> {
  const { workspaceId, permissions } = input
  if (!permissions.analytics) {
    return []
  }

  const [adsChannels, showGoogleAds] = await Promise.all([
    resolveAdsDashboardChannels({
      workspaceId,
      isSuperAdmin: permissions.superAdmin,
    }),
    resolveGoogleAdsDashboardEntry({
      workspaceId,
      isSuperAdmin: permissions.superAdmin,
    }),
  ])
  return visibleAnalyticsSections({ adsChannels, showGoogleAds })
}
