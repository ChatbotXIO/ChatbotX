import { googleAdsConversionService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  distributedLock,
  distributedStore,
  isLockAcquisitionError,
} from "@chatbotx.io/redis"

const log = getChildLogger("google-ads-housekeeping")
const LOCK_TTL_SECONDS = 60 * 60
const LOCK_ACQUIRE_RETRY_SECONDS = 5

const runningLocally = new Set<string>()

/** One cron run at a time: per process, and across processes via a lock. */
const runExclusive = async (
  name: string,
  work: () => Promise<void>,
): Promise<void> => {
  const lockKey = `schedule:${name}`
  if (runningLocally.has(name)) {
    log.warn({ name }, "skipped because a local run is still in progress")
    return
  }
  runningLocally.add(name)
  try {
    await distributedLock.runExclusive({
      key: lockKey,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: work,
    })
  } catch (err) {
    if (
      isLockAcquisitionError(err, lockKey) &&
      (await distributedStore.exists(lockKey))
    ) {
      log.warn({ err, name }, "skipped because another run holds the lock")
      return
    }
    throw err
  } finally {
    runningLocally.delete(name)
  }
}

/** Every 10 minutes: read Data Manager outcomes, then rescue stranded deliveries. */
export const googleAdsHousekeeping = (): Promise<void> =>
  runExclusive("google-ads-housekeeping", async () => {
    // Sequential, but a poll failure must not leave stranded work unswept.
    const failures: unknown[] = []
    const steps: Record<string, () => Promise<void>> = {
      poll: () => googleAdsConversionService.pollProcessingStatus(),
      sweep: () => googleAdsConversionService.sweepStranded(),
    }
    for (const [step, run] of Object.entries(steps)) {
      try {
        await run()
      } catch (err) {
        log.error({ err, step }, "google ads housekeeping step failed")
        failures.push(err)
      }
    }
    if (failures.length > 0) {
      throw failures[0]
    }
  })

/** Daily: re-read each account's conversion actions and surface revoked grants. */
export const googleAdsSyncSetups = (): Promise<void> =>
  runExclusive("google-ads-sync-setups", () =>
    googleAdsConversionService.syncSetups(),
  )
