import { refreshLicense as refreshLicenseToken } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  distributedLock,
  distributedStore,
  isLockAcquisitionError,
} from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:refresh-license"
const LOCK_TTL_SECONDS = 60
const log = getChildLogger("refresh-license")

export async function refreshLicense(): Promise<void> {
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: 0,
      fn: async () => {
        const outcome = await refreshLicenseToken()
        if (outcome.status === "failed") {
          log.warn({ reason: outcome.reason }, "refreshLicense: no new token")
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
        "refreshLicense: skipped because another refresh still holds the lock",
      )
      return
    }

    throw err
  }
}
