import { invalidateCacheKeys } from "@chatbotx.io/redis"
import { logger } from "@/lib/log"

/**
 * Cache key for a number's Meta calling settings. Defined here rather than
 * beside its reader so the two writers that must invalidate it cannot drift
 * from the reader's key — the settings page reads Meta uncached while the inbox
 * reads this cache, so a stale entry makes the two surfaces contradict each
 * other.
 */
export const callingSettingsCacheKey = (integrationId: string): string =>
  `whatsapp-outbound-call-mode:calling-settings:${integrationId}`

/**
 * Call after Meta has accepted the write — invalidating before would just
 * re-cache the old value. Best-effort: by this point Meta and the DB have
 * both committed, so a failure here should just leave a stale inbox read
 * until the TTL lapses, not fail an already-successful save.
 */
export const invalidateCallingSettingsCache = async (
  integrationId: string,
): Promise<void> => {
  try {
    await invalidateCacheKeys(callingSettingsCacheKey(integrationId))
  } catch (error) {
    logger.error(
      { err: error, integrationId },
      "Whatsapp calling: failed to invalidate the cached calling settings",
    )
  }
}
