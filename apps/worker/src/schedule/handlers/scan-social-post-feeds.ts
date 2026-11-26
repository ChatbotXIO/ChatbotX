import { socialPostFeedRunner } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  distributedLock,
  distributedStore,
  isLockAcquisitionError,
} from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:scan-social-post-feeds"
const LOCK_TIMEOUT_SECONDS = 50
const LOCK_ACQUIRE_RETRY_SECONDS = 0

const log = getChildLogger("scan-social-post-feeds")

/**
 * Runs every minute (`register-schedules.ts`): hands each due RSS/Atom feed to
 * the `postPublish` queue as one job (the job takes the feed's lease, so two
 * workers never check one feed at once). A tick that finds the previous one
 * still running is skipped. A blocked workspace's job is a bare return in the
 * worker (`withBlockedOwnerGuard`), so its feed is not checked.
 */
export async function scanSocialPostFeeds(): Promise<number | undefined> {
  try {
    const queued = await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => await socialPostFeedRunner.scanDue(),
    })
    if (queued > 0) {
      log.info({ queued }, "scanSocialPostFeeds: queued feeds")
    }
    return queued
  } catch (err) {
    if (
      isLockAcquisitionError(err, LOCK_KEY) &&
      (await distributedStore.exists(LOCK_KEY))
    ) {
      log.warn(
        { err },
        "scanSocialPostFeeds: skipped because another run still holds the lock",
      )
      return
    }
    throw err
  }
}
