import {
  googleAdsConversionService,
  integrationGoogleAdsService,
} from "@chatbotx.io/business"

/**
 * Whether the Analytics nav shows the Google Ads entry: super admins only, and
 * only once the workspace has a connection or any conversion history (events
 * outlive a disconnect, and the check ignores the selected date range).
 */
export async function resolveGoogleAdsDashboardEntry(input: {
  workspaceId: string
  isSuperAdmin: boolean
}): Promise<boolean> {
  if (!input.isSuperAdmin) {
    return false
  }
  const hasSetup =
    (await integrationGoogleAdsService.getSetup(input.workspaceId)) !== null
  return hasSetup || googleAdsConversionService.hasAnyEvent(input.workspaceId)
}
