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
import { loopableExportContacts } from "./handlers/export-contacts"
import { runImport } from "./handlers/run-import"
import { sendAuditLog } from "./handlers/send-audit-log"
import { sendErrorLog } from "./handlers/send-error-log"

type Handlers = {
  [K in DefaultJobData["type"]]: (
    data: Extract<DefaultJobData, { type: K }>["data"],
  ) => Promise<void>
}

const handlers: Handlers = {
  [DefaultJobAction.exportContacts]: loopableExportContacts,
  [DefaultJobAction.runImport]: runImport,
  [DefaultJobAction.sendErrorLog]: sendErrorLog,
  [DefaultJobAction.sendAuditLog]: sendAuditLog,
}

const worker = new Worker(
  queueNames.enum.default,
  async (job: Job<DefaultJobData>) => {
    logger.info(job.data, `Worker received job: ${job.id}`)
    const handler = handlers[job.data.type] as (data: unknown) => Promise<void>
    if (!handler) {
      logger.warn(`Unknown job name: ${job.name}`)
      return
    }
    await handler(job.data.data)
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
