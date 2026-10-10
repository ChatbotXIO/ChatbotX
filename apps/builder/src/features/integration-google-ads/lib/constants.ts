import { CONNECT_ERROR_QUERY_PARAM } from "@chatbotx.io/utils/connection"

export const GOOGLE_ADS_PROVIDER = "googleAds" as const

/** Query param the OAuth round trip returns with, naming the connect session to show. */
export const SESSION_QUERY_PARAM = "session" as const

/** Settings page path (no query), also the target that clears `?session=`. */
export const googleAdsSettingsPath = (workspaceId: string) =>
  `/space/${workspaceId}/settings/integrations/google-ads`

/**
 * The settings path with `?connect_error=` dropped and every other param (e.g.
 * `?session=`) kept, so dismissing the alert cannot lose the session in view.
 */
export const googleAdsSettingsPathWithoutConnectError = (
  workspaceId: string,
  search: { toString: () => string } | null,
) => {
  const params = new URLSearchParams(search?.toString() ?? "")
  params.delete(CONNECT_ERROR_QUERY_PARAM)
  const query = params.toString()
  return `${googleAdsSettingsPath(workspaceId)}${query ? `?${query}` : ""}`
}
