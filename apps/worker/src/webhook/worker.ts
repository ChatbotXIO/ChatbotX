import {
  queueNames,
  WebhookJobAction,
  type WebhookJobData,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { env } from "../env"
import { createQueueWorker } from "../lib/create-queue-worker"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { runWorker } from "../lib/shutdown"
import { WebhookMatcherService } from "./services/webhook-matcher.service"

const webhookMatcher = new WebhookMatcherService()

function startWebhookWorker() {
  createQueueWorker(
    queueNames.enum.webhook,
    async (job: Job<WebhookJobData>) => {
      const { workspaceId } = job.data.data
      if (await isBlockedWorkspace(workspaceId)) {
        return
      }

      await runJobWithAuditContext(
        { workspaceId, source: "webhook:evaluateWebhooks" },
        async () => {
          switch (job.data.type) {
            case WebhookJobAction.evaluateWebhooks: {
              await webhookMatcher.findAndExecuteWebhooks(job.data.data)
              return
            }
            default:
              return
          }
        },
      )
    },
    { concurrency: env.WEBHOOK_WORKER_CONCURRENCY },
  )
}

runWorker("webhook", startWebhookWorker)
