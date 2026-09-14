/**
 * Mirrors `IntegrationFacebookAdsStatus` — flipped to `invalid` on a Graph 190
 * (expired/invalidated token) so the tool can show the re-grant panel instead
 * of failing every list/create call.
 */
export const facebookMarketingMessagesAuthStatuses = [
  "active",
  "invalid",
] as const
export type FacebookMarketingMessagesAuthStatus =
  (typeof facebookMarketingMessagesAuthStatuses)[number]

export const facebookMarketingMessageBudgetTypes = [
  "daily",
  "lifetime",
] as const
export type FacebookMarketingMessageBudgetType =
  (typeof facebookMarketingMessageBudgetTypes)[number]
