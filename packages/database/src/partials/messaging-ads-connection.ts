/**
 * Status of a per-integration messaging-ads connection
 * (`MessagingAdsConnection` — out/plan/ctwa-ctm-ctid-box-merge.md "Auth =
 * per-integration"). Mirrors `IntegrationFacebookAdsStatus` — flipped to
 * `invalid` on a Graph 190 (expired/invalidated token) error so the box can
 * show a "reconnect needed" state instead of a silent create/list failure.
 */
export const messagingAdsConnectionStatuses = ["active", "invalid"] as const
export type MessagingAdsConnectionStatus =
  (typeof messagingAdsConnectionStatuses)[number]
