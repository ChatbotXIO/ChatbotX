import {
  templateAiFileDispatchService,
  templateInstallService,
  templateSyncRequestService,
  templateUninstallNoticeService,
  templateUninstallSweepService,
} from "@chatbotx.io/business"
import { templateUninstallExecuteService } from "@chatbotx.io/business/template-uninstall/execute"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  enqueueFanOutTemplateUpdate,
  enqueueInstallTemplate,
  enqueueProcessAIFile,
  enqueueSyncTemplateInstallation,
  enqueueUninstallTemplate,
} from "@chatbotx.io/worker-config"
import { settleAndLog } from "../../lib/settle-and-log"

const log = getChildLogger("redispatch-template-jobs")

const BATCH_SIZE = 500
const ENQUEUE_CONCURRENCY = 10

/** Runs one sweep step; a failure is logged and never reaches the next step. */
const runStep = async (
  name: string,
  step: () => Promise<unknown>,
): Promise<void> => {
  try {
    await step()
  } catch (error) {
    log.error({ err: error }, `${name} failed`)
  }
}

/**
 * The template-install outbox sweep: re-enqueues installations nobody
 * finished (the enqueue failed, the job was lost, or the worker died holding
 * the lease). The job id is deterministic and the handler claims atomically,
 * so re-enqueueing an installation that is in fact still running is
 * harmless. Installations too old to retry are closed as failed so none
 * stays pending forever.
 */
export async function redispatchTemplateJobs(): Promise<void> {
  // Every step is isolated: one failing sweep must not keep the others from running.
  // The AI files, syncs and uninstalls are independent of installs.
  await runStep("Template AI file sweep", redispatchTemplateAiFiles)
  // Their own steps are isolated inside them.
  await redispatchTemplateSyncs()
  await redispatchTemplateUninstalls()

  await runStep("Template installation abandon sweep", async () => {
    const abandoned = await templateInstallService.abandonStale()
    if (abandoned > 0) {
      log.warn({ abandoned }, "Closed template installations as abandoned")
    }
  })

  // Failed installs leave staged storage objects behind (a crash right after
  // `fail`, an abandoned or unclaimed row).
  await runStep("Template staged-object cleanup", async () => {
    const cleaned =
      await templateInstallService.cleanupFailedObjects(BATCH_SIZE)
    if (cleaned > 0) {
      log.info({ cleaned }, "Deleted staged objects of failed installations")
    }
  })

  // After-publish effects an install or sync committed but never ran (the
  // process died right after the commit). Idempotent, so a repeat is harmless.
  await runStep("Template after-publish effect sweep", async () => {
    const owing =
      await templateInstallService.listPendingPublishEffects(BATCH_SIZE)
    await settleAndLog({
      items: owing,
      concurrency: ENQUEUE_CONCURRENCY,
      run: ({ id, workspaceId }) =>
        templateInstallService.flushPublishEffects({
          installationId: id,
          workspaceId,
        }),
      log,
      failureMessage: "Could not run some owed after-publish effects",
    })
    if (owing.length > 0) {
      log.info({ owing: owing.length }, "Ran owed after-publish effects")
    }
  })

  await runStep("Template installation re-dispatch", async () => {
    const stale = await templateInstallService.listStale(BATCH_SIZE)
    const failed = await settleAndLog({
      items: stale,
      concurrency: ENQUEUE_CONCURRENCY,
      run: ({ id, workspaceId }) =>
        enqueueInstallTemplate({ installationId: id, workspaceId }),
      log,
      failureMessage: "Could not re-enqueue some template installations",
    })
    if (stale.length > 0) {
      log.info(
        { requeued: stale.length - failed },
        "Re-dispatched installations",
      )
    }
  })
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
  const failed = await settleAndLog({
    items: redispatch,
    concurrency: ENQUEUE_CONCURRENCY,
    run: ({ aiFileId, runId }) => enqueueProcessAIFile({ aiFileId, runId }),
    log,
    failureMessage: "Could not re-enqueue some template AI files",
  })
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
  await runStep("Template sync abandon sweep", async () => {
    const abandoned = await templateSyncRequestService.abandonStale()
    if (abandoned > 0) {
      log.warn({ abandoned }, "Closed template syncs as abandoned")
    }
  })
  await runStep("Template sync re-dispatch", async () => {
    const unfinished =
      await templateSyncRequestService.listUnfinished(BATCH_SIZE)
    await settleAndLog({
      items: unfinished,
      concurrency: ENQUEUE_CONCURRENCY,
      run: ({ id, workspaceId }) =>
        enqueueSyncTemplateInstallation({ syncId: id, workspaceId }),
      log,
      failureMessage: "Could not re-enqueue some template syncs",
    })
  })
  await runStep("Template fan-out catch-up", async () => {
    const behind =
      await templateSyncRequestService.listTemplatesNeedingFanOut(BATCH_SIZE)
    await settleAndLog({
      items: behind,
      concurrency: ENQUEUE_CONCURRENCY,
      run: (template) => enqueueFanOutTemplateUpdate(template),
      log,
      failureMessage: "Could not re-enqueue some template update fan-outs",
    })
  })
}

/**
 * The uninstall outbox sweep: re-enqueues `pending` rows and `running` rows
 * whose lease expired (the job id carries the attempt, the claim CAS
 * makes a duplicate a no-op), re-runs post-commit effects a crash left behind,
 * and redelivers the one audit notice per finished operation. Each step is
 * isolated: they recover independent outbox rows.
 */
export async function redispatchTemplateUninstalls(): Promise<void> {
  // Before listing: an uninstall nobody finished within the window ends `failed`
  // (outcomes kept, requestable again) instead of being re-dispatched forever.
  await runStep("Template uninstall abandon sweep", async () => {
    const abandoned =
      await templateUninstallSweepService.abandonStale(BATCH_SIZE)
    if (abandoned > 0) {
      log.warn({ abandoned }, "Closed template uninstalls as abandoned")
    }
  })
  await runStep("Template uninstall re-dispatch", async () => {
    const stale = await templateUninstallSweepService.listStale(BATCH_SIZE)
    await settleAndLog({
      items: stale,
      concurrency: ENQUEUE_CONCURRENCY,
      run: ({ id, workspaceId, attempt }) =>
        enqueueUninstallTemplate({ installationId: id, workspaceId, attempt }),
      log,
      failureMessage: "Could not re-enqueue some template uninstalls",
    })
  })
  await runStep("Template uninstall effect sweep", async () => {
    const withEffects =
      await templateUninstallSweepService.listPendingEffects(BATCH_SIZE)
    await settleAndLog({
      items: withEffects,
      concurrency: ENQUEUE_CONCURRENCY,
      run: ({ id }) => templateUninstallExecuteService.flushEffects(id),
      log,
      failureMessage: "Could not run some owed uninstall effects",
    })
  })
  // Operations whose last members finished together and never got a snapshot.
  await runStep("Template uninstall finalization", () =>
    templateUninstallSweepService.finalizeStuckOperations(BATCH_SIZE),
  )
  await runStep("Template uninstall notice delivery", () =>
    templateUninstallNoticeService.deliverPending(),
  )
}
