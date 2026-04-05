import type { TriggerEventType } from "@chatbotx.io/database/partials"
import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"

export const WebhookJobAction = {
  evaluateWebhooks: "evaluateWebhooks",
} as const

export type WebhookJobEvaluate = {
  type: "evaluateWebhooks"
  data: {
    workspaceId: string
    contactId: string
    eventType: TriggerEventType
    eventData: Record<string, unknown>
    timestamp: Date
  }
}

export type WebhookJobData = WebhookJobEvaluate

export const webhookQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<WebhookJobData>(queueName.webhook, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
