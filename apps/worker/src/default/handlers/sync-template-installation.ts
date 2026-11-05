import { templateSyncRequestService } from "@chatbotx.io/business"
import { templateSyncExecuteService } from "@chatbotx.io/business/template-sync/execute"
import type { Job } from "bullmq"
import { runLeasedTemplateJob } from "../../lib/run-leased-template-job"
import { enqueueInstalledAiFiles } from "./template-ai-files"

type SyncTemplateInstallationData = {
  syncId: string
  workspaceId: string
}

const UNKNOWN_SYNC_ERROR_CODE = "templateSyncFailed"

/**
 * The sync row is the outbox: the handler claims it with a lease first, so a
 * redelivered or swept job for a finished or in-flight sync is a no-op. The
 * apply transaction rolls back entirely on any error.
 */
export async function syncTemplateInstallation(
  data: SyncTemplateInstallationData,
  job: Job,
) {
  const claim = await templateSyncExecuteService.claim(data)
  if (!claim) {
    return
  }
  const { claimToken, sync } = claim
  await runLeasedTemplateJob({
    job,
    failureMessage: "Template sync failed",
    logContext: data,
    unknownErrorCode: UNKNOWN_SYNC_ERROR_CODE,
    run: async () => {
      await templateSyncExecuteService.run({ sync, claimToken })
      await enqueueInstalledAiFiles(sync.installationId)
    },
    release: () =>
      templateSyncExecuteService.release({ syncId: sync.id, claimToken }),
    fail: (errorCode) =>
      templateSyncExecuteService.fail({
        syncId: sync.id,
        claimToken,
        errorCode,
      }),
  })
}

/** Closes the row when the target owner is blocked, so the sweep never re-finds it. */
export async function skipBlockedTemplateSync(
  data: SyncTemplateInstallationData,
): Promise<void> {
  await templateSyncRequestService.closeUnclaimed({
    syncId: data.syncId,
    status: "skipped",
    errorCode: "workspaceOwnerBlocked",
  })
}
