import { channelPostSyncService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  distributedLock,
  distributedStore,
  isLockAcquisitionError,
} from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:scan-channel-post-syncs"
const LOCK_TIMEOUT_SECONDS = 50
const LOCK_ACQUIRE_RETRY_SECONDS = 5

const log = getChildLogger("scan-channel-post-syncs")

/**
 * Runs every minute (`register-schedules.ts`). Queues the channel post syncs
 * that are due (waiting past their time, queued with a lost job, or running
 * with an owner that stopped heartbeating) and enqueues one job each. A tick
 * that finds the previous one still holding the lock is skipped.
 */
export async function scanChannelPostSyncs(): Promise<void> {
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        const queued = await channelPostSyncService.scanDue()
        if (queued > 0) {
          log.info({ queued }, "scanChannelPostSyncs: queued syncs")
        }
      },
    })
  } catch (err) {
    if (
      isLockAcquisitionError(err, LOCK_KEY) &&
      (await distributedStore.exists(LOCK_KEY))
    ) {
      log.warn(
        { err },
        "scanChannelPostSyncs: skipped because another run still holds the lock",
      )
      return
    }
    throw err
  }
}
