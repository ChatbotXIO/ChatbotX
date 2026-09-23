import { contactScanService } from "@chatbotx.io/business"
import { CONTACT_SCAN_MAX_ATTEMPTS } from "@chatbotx.io/business/contact-scan"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  distributedLock,
  distributedStore,
  isLockAcquisitionError,
} from "@chatbotx.io/redis"
import {
  buildContactScanJobId,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"

const LOCK_KEY = "schedule:scan-contact-scans"
const LOCK_TIMEOUT_SECONDS = 50
const LOCK_ACQUIRE_RETRY_SECONDS = 5
const BATCH = 500

const log = getChildLogger("scan-contact-scans")

/**
 * Runs every minute (`register-schedules.ts`). Sweeps stuck Automatic
 * Customer Scan runs, then dispatches every due run to the integration
 * queue — mirrors `scan-coexist-runs.ts`'s `scanCoexistRuns` structure, minus
 * the per-channel recovery passes (contact scan carries no channel-specific
 * recovery state today). It skips an overlapping run using the shared
 * `distributedLock` error guard.
 */
export async function scanContactScans(): Promise<void> {
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        await contactScanService.markMaxAttemptsFailed({
          maxAttempts: CONTACT_SCAN_MAX_ATTEMPTS,
        })

        const picked = await contactScanService.pickDue({
          batchSize: BATCH,
          maxAttempts: CONTACT_SCAN_MAX_ATTEMPTS,
        })

        if (picked.length === 0) {
          return
        }

        log.info({ count: picked.length }, "scanContactScans: picked runs")

        for (const run of picked) {
          try {
            await integrationQueue.add(
              IntegrationJobAction.contactScan,
              {
                type: IntegrationJobAction.contactScan,
                data: { runId: run.id, workspaceId: run.workspaceId },
              },
              {
                jobId: buildContactScanJobId({
                  runId: run.id,
                  attempts: run.attempts,
                }),
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: { count: 100 },
              },
            )
          } catch (err) {
            log.error(
              { err, runId: run.id },
              "scanContactScans: enqueue failed",
            )
          }
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
        "scanContactScans: skipped because another run still holds the lock",
      )
      return
    }

    throw err
  }
}
