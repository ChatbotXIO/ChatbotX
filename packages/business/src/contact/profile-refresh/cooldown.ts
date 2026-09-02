import { distributedStore } from "@chatbotx.io/redis" // packages/redis/src/index.ts:15
import { logger } from "../../logger"

export const PROFILE_REFRESH_COOLDOWN_SECONDS = 5 * 60 // owner decision

const cooldownKey = (contactInboxId: string) =>
  `contact-profile-refresh:cooldown:${contactInboxId}`

/**
 * Best-effort: a Redis error is logged at `warn` and treated as "not cooling
 * down" so a transient Redis outage never blocks a legitimate profile fetch.
 */
export const isContactProfileRefreshCoolingDown = async (
  contactInboxId: string,
): Promise<boolean> => {
  try {
    return await distributedStore.exists(cooldownKey(contactInboxId)) // distributed-store.ts:60
  } catch (error) {
    logger.warn(
      { error, contactInboxId },
      "isContactProfileRefreshCoolingDown: Redis check failed, treating as not cooling down",
    )
    return false
  }
}

/**
 * Best-effort: a Redis error is logged at `warn` and ignored — the caller's
 * outcome does not change because the cooldown marker failed to write.
 */
export const startContactProfileRefreshCooldown = async (
  contactInboxId: string,
): Promise<void> => {
  try {
    await distributedStore.setNumber(
      cooldownKey(contactInboxId),
      Date.now(),
      PROFILE_REFRESH_COOLDOWN_SECONDS,
    ) // distributed-store.ts:310
  } catch (error) {
    logger.warn(
      { error, contactInboxId },
      "startContactProfileRefreshCooldown: Redis write failed",
    )
  }
}
