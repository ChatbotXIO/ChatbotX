import { withBlockedOwnerGuard } from "@chatbotx.io/business"
import {
  type NotificationJobData,
  queueNames,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { env } from "../env"
import { createQueueWorker } from "../lib/create-queue-worker"
import { runWorker } from "../lib/shutdown"
import { checkPushReceipts } from "./handlers/check-push-receipts"
import { notifyNewOrder } from "./handlers/notify-new-order"
import { sendPushForNotificationJob } from "./handlers/send-push"

function startNotificationWorker() {
  createQueueWorker(
    queueNames.enum.notification,
    async (job: Job<NotificationJobData>) => {
      // Receipts span many workspaces, so they run outside the owner guard.
      const jobData = job.data
      if (jobData.type === "checkPushReceipts") {
        await checkPushReceipts(jobData)
        return
      }
      await withBlockedOwnerGuard(jobData.data.workspaceId, async () => {
        if (jobData.type === "notifyNewOrder") {
          await notifyNewOrder(jobData)
          return
        }
        await sendPushForNotificationJob(jobData)
      })
    },
    { concurrency: env.NOTIFICATION_WORKER_CONCURRENCY },
  )
}

runWorker("notification", startNotificationWorker)
