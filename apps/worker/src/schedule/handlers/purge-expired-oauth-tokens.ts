import { mcpOAuthService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock } from "@chatbotx.io/redis"

const log = getChildLogger("purge-expired-oauth-tokens")
const LOCK_KEY = "schedule:purge-expired-oauth-tokens"
const LOCK_TTL_SECONDS = 55 * 60

export const purgeExpiredOAuthTokens = async (): Promise<void> => {
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      fn: async () => {
        const deleted = await mcpOAuthService.purgeExpiredTokens()
        if (deleted > 0) {
          log.info({ deleted }, "purgeExpiredOAuthTokens: rows purged")
        }
      },
    })
  } catch (err) {
    log.error({ err }, "purgeExpiredOAuthTokens: failed")
    throw err
  }
}
