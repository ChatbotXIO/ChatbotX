import type { TriggerEventType } from "@chatbotx.io/database/partials"
import { defineQueue } from "../../lib/define-queue"

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

export const webhookQueue = defineQueue<WebhookJobData>("webhook")
