import { purgeStaleAutomationThrottles } from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock } from "@chatbotx.io/redis"

const log = getChildLogger("purge-automation-throttle")

const LOCK_KEY = "schedule:purge-automation-throttle"
// Must stay under the hourly cadence this cron runs on (register-schedules.ts).
const LOCK_TTL_SECONDS = 55 * 60

/**
 * Drops `AutomationThrottle` rows whose `lastTriggeredAt` is old enough that
 * they can no longer affect a live claim. These rows are cheap
 * per-subject state, not an audit log, so a hard delete (no soft-delete
 * convention) is correct here.
 */
export const purgeAutomationThrottle = async (): Promise<void> =>
  distributedLock.runExclusive({
    key: LOCK_KEY,
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const deleted = await purgeStaleAutomationThrottles()

      if (deleted > 0) {
        log.info({ deleted }, "purgeAutomationThrottle: rows purged")
      }
    },
  })
