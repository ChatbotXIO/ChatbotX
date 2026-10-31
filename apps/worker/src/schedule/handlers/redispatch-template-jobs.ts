import {
  templateAiFileDispatchService,
  templateInstallService,
  templateSyncRequestService,
  templateUninstallNoticeService,
  templateUninstallSweepService,
} from "@chatbotx.io/business"
import { templateUninstallExecuteService } from "@chatbotx.io/business/template-uninstall/execute"
import { getChildLogger } from "@chatbotx.io/logger"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import {
  enqueueFanOutTemplateUpdate,
  enqueueInstallTemplate,
  enqueueProcessAIFile,
  enqueueSyncTemplateInstallation,
  enqueueUninstallTemplate,
} from "@chatbotx.io/worker-config"

const log = getChildLogger("redispatch-template-jobs")

const BATCH_SIZE = 500
const ENQUEUE_CONCURRENCY = 10

/**
 * The template-install outbox sweep: re-enqueues installations nobody
 * finished (the enqueue failed, the job was lost, or the worker died holding
 * the lease). The job id is deterministic and the handler claims atomically,
 * so re-enqueueing an installation that is in fact still running is
 * harmless. Installations too old to retry are closed as failed so none
 * stays pending forever.
 */
export async function redispatchTemplateJobs(): Promise<void> {
  // Its own failure must not keep stuck installations from being re-dispatched.
  try {
    await redispatchTemplateAiFiles()
  } catch (error) {
    log.error({ err: error }, "Template AI file sweep failed")
  }

  // Likewise isolated: syncs and the auto-update catch-up are independent of installs.
  try {
    await redispatchTemplateSyncs()
  } catch (error) {
    log.error({ err: error }, "Template sync sweep failed")
  }

  // Isolated as well: an uninstall stuck behind a lost job must not stall installs.
  try {
    await redispatchTemplateUninstalls()
  } catch (error) {
    log.error({ err: error }, "Template uninstall sweep failed")
  }

  const abandoned = await templateInstallService.abandonStale()
  if (abandoned > 0) {
    log.warn({ abandoned }, "Closed template installations as abandoned")
  }

  // Failed installs leave staged storage objects behind (a crash right after
  // `fail`, an abandoned or unclaimed row); isolated so it never blocks re-dispatch.
  try {
    const cleaned =
      await templateInstallService.cleanupFailedObjects(BATCH_SIZE)
    if (cleaned > 0) {
      log.info({ cleaned }, "Deleted staged objects of failed installations")
    }
  } catch (error) {
    log.error({ err: error }, "Template staged-object cleanup failed")
  }

  // After-publish effects an install or sync committed but never ran (the
  // process died right after the commit). Idempotent, so a repeat is harmless.
  try {
    const owing =
      await templateInstallService.listPendingPublishEffects(BATCH_SIZE)
    await mapWithConcurrency(
      owing,
      ENQUEUE_CONCURRENCY,
      ({ id, workspaceId }) =>
        templateInstallService.flushPublishEffects({
          installationId: id,
          workspaceId,
        }),
    )
    if (owing.length > 0) {
      log.info({ owing: owing.length }, "Ran owed after-publish effects")
    }
  } catch (error) {
    log.error({ err: error }, "Template after-publish effect sweep failed")
  }

  const stale = await templateInstallService.listStale(BATCH_SIZE)
  const results = await mapWithConcurrency(
    stale,
    ENQUEUE_CONCURRENCY,
    ({ id, workspaceId }) =>
      enqueueInstallTemplate({ installationId: id, workspaceId }),
  )
  const failed = results.filter(({ status }) => status === "rejected").length
  if (failed > 0) {
    log.error({ failed }, "Could not re-enqueue some template installations")
  }
  if (stale.length > 0) {
    log.info({ requeued: stale.length - failed }, "Re-dispatched installations")
  }
}

/**
 * Knowledge files an install created are queued for embedding only after the
 * install committed; this re-enqueues the ones whose job was lost and closes
 * the ones that have waited too long. Regular AI files are never listed.
 */
export async function redispatchTemplateAiFiles(): Promise<void> {
  const { redispatch, expired } =
    await templateAiFileDispatchService.listForSweep()
  if (expired > 0) {
    log.warn({ expired }, "Closed queued template AI files as failed")
  }
  const results = await mapWithConcurrency(
    redispatch,
    ENQUEUE_CONCURRENCY,
    ({ aiFileId, runId }) => enqueueProcessAIFile({ aiFileId, runId }),
  )
  const failed = results.filter(({ status }) => status === "rejected").length
  if (failed > 0) {
    log.error({ failed }, "Could not re-enqueue some template AI files")
  }
  if (redispatch.length > 0) {
    log.info(
      { requeued: redispatch.length - failed },
      "Re-dispatched template AI files",
    )
  }
}

/**
 * The template-sync outbox sweep: re-enqueues syncs nobody finished, and
 * re-runs the fan-out of any template with following installations still
 * behind (the save's fan-out job may have been lost). Both are idempotent:
 * job ids are deterministic, sync rows insert-or-ignore, and the handler
 * claims atomically.
 */
export async function redispatchTemplateSyncs(): Promise<void> {
  const abandoned = await templateSyncRequestService.abandonStale()
  if (abandoned > 0) {
    log.warn({ abandoned }, "Closed template syncs as abandoned")
  }
  const unfinished = await templateSyncRequestService.listUnfinished(BATCH_SIZE)
  const results = await mapWithConcurrency(
    unfinished,
    ENQUEUE_CONCURRENCY,
    ({ id, workspaceId }) =>
      enqueueSyncTemplateInstallation({ syncId: id, workspaceId }),
  )
  const failed = results.filter(({ status }) => status === "rejected").length
  if (failed > 0) {
    log.error({ failed }, "Could not re-enqueue some template syncs")
  }

  const behind =
    await templateSyncRequestService.listTemplatesNeedingFanOut(BATCH_SIZE)
  await mapWithConcurrency(behind, ENQUEUE_CONCURRENCY, (template) =>
    enqueueFanOutTemplateUpdate(template),
  )
}

/**
 * The uninstall outbox sweep: re-enqueues `pending` rows and `running` rows
 * whose lease expired (the job id carries the attempt, the claim CAS
 * makes a duplicate a no-op), re-runs post-commit effects a crash left behind,
 * and redelivers the one audit notice per finished operation.
 */
export async function redispatchTemplateUninstalls(): Promise<void> {
  // Before listing: an uninstall nobody finished within the window ends `failed`
  // (outcomes kept, requestable again) instead of being re-dispatched forever.
  const abandoned = await templateUninstallSweepService.abandonStale(BATCH_SIZE)
  if (abandoned > 0) {
    log.warn({ abandoned }, "Closed template uninstalls as abandoned")
  }
  const stale = await templateUninstallSweepService.listStale(BATCH_SIZE)
  const results = await mapWithConcurrency(
    stale,
    ENQUEUE_CONCURRENCY,
    ({ id, workspaceId, attempt }) =>
      enqueueUninstallTemplate({ installationId: id, workspaceId, attempt }),
  )
  const failed = results.filter(({ status }) => status === "rejected").length
  if (failed > 0) {
    log.error({ failed }, "Could not re-enqueue some template uninstalls")
  }

  const withEffects =
    await templateUninstallSweepService.listPendingEffects(BATCH_SIZE)
  await mapWithConcurrency(withEffects, ENQUEUE_CONCURRENCY, ({ id }) =>
    templateUninstallExecuteService.flushEffects(id),
  )

  // Operations whose last members finished together and never got a snapshot.
  await templateUninstallSweepService.finalizeStuckOperations(BATCH_SIZE)
  await templateUninstallNoticeService.deliverPending()
}
