import { workspaceService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock, distributedStore } from "@chatbotx.io/redis"
import { allIntegrations } from "../../services/integrations"

const LOCK_KEY = "schedule:purge-workspaces"
const log = getChildLogger("purge-workspaces")
const LOCK_TTL_SECONDS = 3 * 60 * 60
const LOCK_ACQUIRE_RETRY_SECONDS = 5
let isPurgeWorkspacesRunning = false

export async function purgeWorkspaces(): Promise<void> {
  if (isPurgeWorkspacesRunning) {
    log.warn("purgeWorkspaces: skipped because a local purge is still running")
    return
  }

  isPurgeWorkspacesRunning = true
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        const deleted = await workspaceService.purgeDueScheduled({
          integrations: allIntegrations,
        })

        if (deleted > 0) {
          log.info({ deleted }, "purgeWorkspaces: workspaces purged")
        }
      },
    })
  } catch (err) {
    if (isLockAcquisitionFailure(err) && (await isPurgeLockHeld())) {
      log.warn(
        { err },
        "purgeWorkspaces: skipped because another purge still holds the lock",
      )
      return
    }

    throw err
  } finally {
    isPurgeWorkspacesRunning = false
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

async function isPurgeLockHeld(): Promise<boolean> {
  return await distributedStore.exists(LOCK_KEY)
}
