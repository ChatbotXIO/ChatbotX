import { withBlockedOwnerGuard } from "@chatbotx.io/business"
import {
  DefaultJobAction,
  type DefaultJobData,
  defaultQueue,
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { handleBulkTagContacts } from "./handlers/bulk-tag-contacts"
import { loopableExportContacts } from "./handlers/export-contacts"
import { runImport } from "./handlers/run-import"
import { sendAuditLog } from "./handlers/send-audit-log"
import { sendErrorLog } from "./handlers/send-error-log"
import { handleSyncChannelLabels } from "./handlers/sync-channel-labels"
import { handleSyncTag } from "./handlers/sync-tag"

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
        if (
          (await withBlockedOwnerGuard(
            await resolveWorkspaceId(job.data.data),
            async () => true,
          )) === undefined
        ) {
          return
        }
        await loopableExportContacts(job.data.data)
        return
      case DefaultJobAction.bulkTagContacts:
        await handleBulkTagContacts(job.data.data, {
          attemptsMade: job.attemptsMade,
        })
        return
      case DefaultJobAction.runImport:
        if (
          (await withBlockedOwnerGuard(
            await resolveWorkspaceId(job.data.data),
            async () => true,
          )) === undefined
        ) {
          return
        }
        await runImport(job.data.data)
        return
      case DefaultJobAction.syncTag:
        if (
          (await withBlockedOwnerGuard(
            await resolveWorkspaceId(job.data.data),
            async () => true,
          )) === undefined
        ) {
          return
        }
        await handleSyncTag(job.data.data)
        return
      case DefaultJobAction.syncChannelLabels:
        if (
          (await withBlockedOwnerGuard(
            await resolveWorkspaceId(job.data.data),
            async () => true,
          )) === undefined
        ) {
          return
        }
        await handleSyncChannelLabels(job.data.data)
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
