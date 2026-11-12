import { userService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  distributedLock,
  distributedStore,
  isLockAcquisitionError,
} from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:purge-deleted-users"
const log = getChildLogger("purge-deleted-users")
const LOCK_TTL_SECONDS = 3 * 60 * 60
const LOCK_ACQUIRE_RETRY_SECONDS = 5
const BATCH_SIZE = 100
let isPurgeDeletedUsersRunning = false

export async function purgeDeletedUsers(): Promise<void> {
  if (isPurgeDeletedUsersRunning) {
    log.warn(
      "purgeDeletedUsers: skipped because a local purge is still running",
    )
    return
  }

  isPurgeDeletedUsersRunning = true
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        const userIds = await userService.listDueDeletedUserIds({
          limit: BATCH_SIZE,
        })
        let deleted = 0
        let failed = 0
        let notDue = 0
        let pending = 0
        for (const userId of userIds) {
          try {
            const result = await userService.purgeDeletedUser(userId)
            if (result === "deleted") {
              deleted += 1
            } else if (result === "pending") {
              pending += 1
            } else {
              notDue += 1
            }
          } catch (error) {
            failed += 1
            log.error({ err: error, userId }, "purgeDeletedUsers: user failed")
          }
        }
        if (deleted > 0 || failed > 0 || pending > 0) {
          log.info(
            { attempted: userIds.length, deleted, failed, notDue, pending },
            "purgeDeletedUsers: sweep completed",
          )
        }
      },
    })
  } catch (error) {
    if (
      isLockAcquisitionError(error, LOCK_KEY) &&
      (await distributedStore.exists(LOCK_KEY))
    ) {
      log.warn(
        { err: error },
        "purgeDeletedUsers: skipped because another purge still holds the lock",
      )
      return
    }
    throw error
  } finally {
    isPurgeDeletedUsersRunning = false
  }
}
