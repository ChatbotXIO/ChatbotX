import type { ConditionModel, WebhookModel } from "@chatbotx.io/database/types"

export type WebhookWithConditions = WebhookModel & {
  conditions: ConditionModel[]
}

export type WebhookEventData = {
  workspaceId: string
  contactId: string
  eventType: string
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
}
