import {
  DefaultJobAction,
  type DefaultJobData,
  defaultQueue,
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { handleBulkTagContacts } from "./handlers/bulk-tag-contacts"
import { loopableExportContacts } from "./handlers/export-contacts"
import { exportCoupons } from "./handlers/export-coupons"
import { checkMetaCatalogSync } from "./handlers/meta-catalog/check"
import { importMetaCatalogProducts } from "./handlers/meta-catalog/import-products"
import { submitMetaCatalogSync } from "./handlers/meta-catalog/submit"
import { runImport } from "./handlers/run-import"
import { sendAppointmentReminder } from "./handlers/send-appointment-reminder"
import { sendAuditLog } from "./handlers/send-audit-log"
import { sendErrorLog } from "./handlers/send-error-log"
import { handleSyncChannelLabels } from "./handlers/sync-channel-labels"
import { syncExternalCalendarEvent } from "./handlers/sync-external-calendar-event"
import { handleSyncTag } from "./handlers/sync-tag"

const isBlockedJob = async (data: unknown) =>
  isBlockedWorkspace(await resolveWorkspaceId(data))

async function startDefaultWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Default worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap default worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.default,
    async (job: Job<DefaultJobData>) => {
      logger.info(job.data, `Worker received job: ${job.id}`)

      switch (job.data.type) {
        case DefaultJobAction.sendAuditLog:
          await sendAuditLog(job.data.data)
          return
        case DefaultJobAction.sendErrorLog:
          await sendErrorLog(job.data.data)
          return
        case DefaultJobAction.exportContacts:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await loopableExportContacts(job.data.data)
          return
        case DefaultJobAction.exportCoupons:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await exportCoupons(job.data.data)
          return
        case DefaultJobAction.bulkTagContacts:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await handleBulkTagContacts(job.data.data, {
            attemptsMade: job.attemptsMade,
          })
          return
        case DefaultJobAction.runImport:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await runImport(job.data.data)
          return
        case DefaultJobAction.syncTag:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await handleSyncTag(job.data.data)
          return
        case DefaultJobAction.syncChannelLabels:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await handleSyncChannelLabels(job.data.data)
          return
        case DefaultJobAction.submitMetaCatalogSync:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await submitMetaCatalogSync(job.data.data)
          return
        case DefaultJobAction.importMetaCatalogProducts:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await importMetaCatalogProducts(job.data.data)
          return
        case DefaultJobAction.checkMetaCatalogSync:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await checkMetaCatalogSync(job.data.data)
          return
        case DefaultJobAction.syncExternalCalendarEvent:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await syncExternalCalendarEvent(job.data.data)
          return
        case DefaultJobAction.sendAppointmentReminder:
          if (await isBlockedJob(job.data.data)) {
            return
          }
          await sendAppointmentReminder(job.data.data)
          return
        default:
          logger.warn(`Unknown job name: ${job.name}`)
          return
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
    },
  )

  worker.on("failed", async (job, err) => {
    if (!job) {
      return
    }
    logger.error(err, `Job ${job.id} has failed`)
    if (job.data.type === DefaultJobAction.sendErrorLog) {
      return
    }

    const workspaceId =
      "workspaceId" in job.data.data ? job.data.data.workspaceId : undefined
    if (!workspaceId) {
      return
    }

    try {
      await defaultQueue.add(DefaultJobAction.sendErrorLog, {
        type: DefaultJobAction.sendErrorLog,
        data: {
          workspaceId,
          error: {
            message: err.message,
            stack: err.stack,
            httpCode: "500",
          },
        },
      })
    } catch (error) {
      logger.error(error, `Error sending error log for job ${job.id}`)
    }
  })

  let isShuttingDown = false
  async function shutdown() {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    try {
      await worker.close()
      process.exit(0)
    } catch (err) {
      logger.error(err, "[DefaultWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startDefaultWorker()
