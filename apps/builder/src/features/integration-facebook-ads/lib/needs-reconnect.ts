import type { IntegrationFacebookAdsResource } from "../schemas"

export function needsFacebookAdsReconnect(
  integration: IntegrationFacebookAdsResource,
): boolean {
  if (integration.status === "invalid") {
    return true
  }
  return Boolean(
    integration.tokenExpiresAt &&
      new Date(integration.tokenExpiresAt).getTime() < Date.now(),
  )
}
