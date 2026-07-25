import type { TriggerEventType } from "@chatbotx.io/database/partials"
import type { ConditionModel, WebhookModel } from "@chatbotx.io/database/types"
import type { MatchableEventType } from "@chatbotx.io/events"

export type WebhookWithConditions = WebhookModel & {
  conditions: ConditionModel[]
}

export type WebhookEventData = {
  workspaceId: string
  contactId: string
  eventType: TriggerEventType
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
}

export type MatchableWebhookEventData = WebhookEventData & {
  eventType: MatchableEventType
}

/**
 * Outbound request body. One payload is built per event and shared by every
 * webhook matched for it, so treat it as read-only once built.
 */
export type WebhookPayload = Record<string, unknown>
