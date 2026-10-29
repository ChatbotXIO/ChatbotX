import { withBlockedOwnerGuard } from "@chatbotx.io/business"
import {
  type NotificationJobData,
  queueNames,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { env } from "../env"
import { createQueueWorker } from "../lib/create-queue-worker"
import { runWorker } from "../lib/shutdown"
import { notifyNewOrder } from "./handlers/notify-new-order"
import { sendPushForNotificationJob } from "./handlers/send-push"

function startNotificationWorker() {
  createQueueWorker(
    queueNames.enum.notification,
    async (job: Job<NotificationJobData>) => {
      await withBlockedOwnerGuard(job.data.data.workspaceId, async () => {
        if (job.data.type === "notifyNewOrder") {
          await notifyNewOrder(job.data)
          return
        }
        await sendPushForNotificationJob(job.data)
      })
    },
    { concurrency: env.NOTIFICATION_WORKER_CONCURRENCY },
  )
}

runWorker("notification", startNotificationWorker)
