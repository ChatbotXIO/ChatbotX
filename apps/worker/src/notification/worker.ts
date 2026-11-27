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
import { notifyPostTarget } from "./handlers/notify-post-target"
import { notifyPublishConnection } from "./handlers/notify-publish-connection"
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
        if (
          job.data.type === "notifyPostFailed" ||
          job.data.type === "notifyPostNeedsReview"
        ) {
          await notifyPostTarget(job.data)
          return
        }
        if (job.data.type === "notifyPublishConnection") {
          await notifyPublishConnection(job.data)
          return
        }
        await sendPushForNotificationJob(job.data)
      })
    },
    { concurrency: env.NOTIFICATION_WORKER_CONCURRENCY },
  )
}

runWorker("notification", startNotificationWorker)
