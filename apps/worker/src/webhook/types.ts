import type { ConditionModel, WebhookModel } from "@chatbotx.io/database/types"

export type WebhookWithConditions = WebhookModel & {
  conditions: ConditionModel[]
}

export type WebhookEventData = {
  chatbotId: string
  contactId: string
  eventType: number
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
}
