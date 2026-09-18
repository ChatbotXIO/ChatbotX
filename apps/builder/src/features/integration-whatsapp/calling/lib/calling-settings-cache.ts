import { invalidateCacheKeys } from "@chatbotx.io/redis"
import { logger } from "@/lib/log"

/**
 * Cache key for a number's Meta calling settings.
 *
 * Defined here rather than beside its reader so the two writers that must
 * invalidate it cannot drift from the reader's key — the settings page reads
 * Meta uncached while the inbox reads this cache, so a stale entry makes the
 * two surfaces contradict each other.
 */
export const callingSettingsCacheKey = (integrationId: string): string =>
  `whatsapp-outbound-call-mode:calling-settings:${integrationId}`

/**
 * Drops the cached settings so the next inbox read sees the change at once
 * instead of waiting out the TTL. Call it after Meta has accepted the write —
 * invalidating before would just re-cache the old value.
 *
 * Best-effort on purpose. By the time this runs, Meta and the database have
 * both committed, so throwing here would fail a save that actually succeeded
 * and send the card rolling back switches that are already live. The worst a
 * failure costs is a stale inbox read until the short TTL lapses.
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
