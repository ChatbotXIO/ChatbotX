import { invalidateCacheKeys } from "@chatbotx.io/redis"

/**
 * Cache key of an account's live creator settings. It is per account (a TikTok
 * login owns one profile) so a disconnect or a re-auth can drop it by id.
 * Token-free: the cached value is the settings DTO only.
 */
export const publishingSettingsCacheKey = (input: {
  accountId: string
  workspaceId: string
}): string =>
  `social-account:publishing-settings:${input.workspaceId}:${input.accountId}`

/** Forgets the cached creator settings of an account whose token state changed. */
export const invalidatePublishingSettings = async (input: {
  accountId: string
  workspaceId: string
}): Promise<void> => {
  try {
    await invalidateCacheKeys(publishingSettingsCacheKey(input))
  } catch {
    // Best effort: the entry expires on its own within seconds.
  }
}
