import {
  DefaultJobAction,
  type DefaultJobData,
  defaultQueue,
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
} from "@aha.chat/worker-config"
import { type Job, Worker } from "bullmq"
import { logger } from "../lib/logger"
import { loopableExportContacts } from "./handlers/export-contacts"
import { sendAuditLog } from "./handlers/send-audit-log"
import { sendErrorLog } from "./handlers/send-error-log"

const worker = new Worker(
  queueName.default,
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
        await loopableExportContacts(job.data.data)
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
  if (job) {
    logger.error(err, `Job ${job.id} has failed`)

    if (job.data.type !== DefaultJobAction.sendErrorLog) {
      try {
        await defaultQueue.add(DefaultJobAction.sendErrorLog, {
          type: DefaultJobAction.sendErrorLog,
          data: {
            chatbotId: job.data.data.chatbotId,
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
    }
  }
})
