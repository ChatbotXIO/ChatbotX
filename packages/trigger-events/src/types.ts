import type { TriggerCondition } from "@aha.chat/database/enums"

export type TriggerEventType = TriggerCondition

export type TriggerEventData = {
  chatbotId: string
  contactId: string
  eventType: TriggerEventType
  metadata: Record<string, unknown>
  timestamp: Date
  source?: string
}
