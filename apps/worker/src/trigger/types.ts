import type { Prisma } from "@aha.chat/database"

export type TriggerWithConditions = Prisma.TriggerGetPayload<{
  include: { triggerConditions: true }
}>

export type TriggerEventData = {
  chatbotId: string
  contactId: string
  eventType: number
  eventData: Record<string, unknown>
  timestamp: Date
}

export type ConditionEvaluationContext = {
  condition: TriggerWithConditions["triggerConditions"][number]
  eventData: TriggerEventData
  chatbotId: string
  contactId: string
}

export type ActionExecutionContext = {
  action: Record<string, unknown>
  contactId: string
  chatbotId: string
}
