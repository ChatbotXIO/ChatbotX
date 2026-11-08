import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "../logger"

/** How long a click on "Create a new workspace" on a share page is remembered. */
const INSTALL_INTENT_TTL_SECONDS = 300

const intentKey = (userId: string): string =>
  `template-install-intent:${userId}`

/**
 * "This user is creating a workspace from this template's share page": the
 * template then takes the place of the tenant's default. Kept per user, since
 * a channel connect can leave the site and come back. One slot, so a newer
 * choice replaces an older one. Only a convenience: when Redis fails the
 * workspace is simply created without it.
 */
export const templateInstallIntentService = {
  async remember(input: { userId: string; shareToken: string }): Promise<void> {
    try {
      await distributedStore.put(
        intentKey(input.userId),
        input.shareToken,
        INSTALL_INTENT_TTL_SECONDS,
      )
    } catch (err) {
      logger.warn({ err }, "Could not remember the template install intent")
    }
  },

  /** Reads and deletes in one step: of two creations at once, one gets it. */
  async take(userId: string): Promise<string | null> {
    try {
      return await distributedStore.take<string>(intentKey(userId))
    } catch (err) {
      logger.warn({ err }, "Could not read the template install intent")
      return null
    }
  },

  async clear(userId: string): Promise<void> {
    await this.take(userId)
  },
}
