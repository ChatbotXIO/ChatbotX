import { messageCleanupService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock, distributedStore } from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:purge-orphaned-attachments"
const log = getChildLogger("purge-orphaned-attachments")
const BATCH_SIZE = 1000
const LOCK_TTL_SECONDS = 60 * 60
const LOCK_ACQUIRE_RETRY_SECONDS = 5
let isPurgeOrphanedAttachmentsRunning = false

export async function purgeOrphanedAttachments(): Promise<void> {
  if (isPurgeOrphanedAttachmentsRunning) {
    log.warn(
      "purgeOrphanedAttachments: skipped because a local run is still in progress",
    )
    return
  }

  isPurgeOrphanedAttachmentsRunning = true
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        const deleted = await messageCleanupService.purgeOrphanedAttachments({
          limit: BATCH_SIZE,
        })

        if (deleted > 0) {
          log.info(
            { deleted },
            "purgeOrphanedAttachments: orphaned attachments purged",
          )
        }
      },
    })
  } catch (err) {
    if (
      isLockAcquisitionFailure(err) &&
      (await distributedStore.exists(LOCK_KEY))
    ) {
      log.warn(
        { err },
        "purgeOrphanedAttachments: skipped because another run still holds the lock",
      )
      return
    }

    throw err
  } finally {
    isPurgeOrphanedAttachmentsRunning = false
  }
}

function isLockAcquisitionFailure(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    "code" in err &&
    "key" in err &&
    err.name === "LockAcquisitionError" &&
    err.code === "LOCK_ACQUISITION_FAILED" &&
    err.key === LOCK_KEY
  )
}
