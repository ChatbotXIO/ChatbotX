import { workspaceSupportAccessService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock, distributedStore } from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:clear-expired-support-access"
const log = getChildLogger("clear-expired-support-access")
const LOCK_TTL_SECONDS = 60 * 60
const LOCK_ACQUIRE_RETRY_SECONDS = 5
let isClearExpiredSupportAccessRunning = false

export async function clearExpiredSupportAccess(): Promise<void> {
  if (isClearExpiredSupportAccessRunning) {
    log.warn(
      "clearExpiredSupportAccess: skipped because a local run is still in progress",
    )
    return
  }

  isClearExpiredSupportAccessRunning = true
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        const cleared = await workspaceSupportAccessService.clearExpired()

        if (cleared > 0) {
          log.info(
            { cleared },
            "clearExpiredSupportAccess: expired support access cleared",
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
        "clearExpiredSupportAccess: skipped because another run still holds the lock",
      )
      return
    }

    throw err
  } finally {
    isClearExpiredSupportAccessRunning = false
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
