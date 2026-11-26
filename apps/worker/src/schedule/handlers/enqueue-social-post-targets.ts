import {
  socialPostPublishService,
  socialPostScheduleService,
} from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  distributedLock,
  distributedStore,
  isLockAcquisitionError,
} from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:enqueue-social-post-targets"
const LOCK_TIMEOUT_SECONDS = 50
const LOCK_ACQUIRE_RETRY_SECONDS = 5

const log = getChildLogger("enqueue-social-post-targets")

/**
 * Runs every minute (`register-schedules.ts`). A tick that finds the previous
 * one still holding the lock is skipped.
 */
export async function enqueueSocialPostTargets(): Promise<void> {
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        // Targets late by more than the late-publish window are given up first,
        // so the scan below never hands them to the queue.
        const missed = await socialPostScheduleService.failMissed()
        if (missed > 0) {
          log.warn({ missed }, "enqueueSocialPostTargets: missed schedules")
        }
        const queued = await socialPostPublishService.scanDue()
        if (queued > 0) {
          log.info({ queued }, "enqueueSocialPostTargets: queued targets")
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
        "enqueueSocialPostTargets: skipped because another run still holds the lock",
      )
      return
    }
    throw err
  }
}
