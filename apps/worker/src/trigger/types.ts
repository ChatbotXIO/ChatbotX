import type { Prisma } from "@aha.chat/database"
import type { ChatbotModel } from "@aha.chat/database/types"

export type TriggerWithConditions = Prisma.TriggerGetPayload<{
  include: { conditions: true }
}>

export type TriggerEventData = {
  chatbotId: string
  contactId: string
  eventType: number
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
}

export type ConditionEvaluationContext = {
  condition: TriggerWithConditions["conditions"][number]
  eventData: TriggerEventData
  chatbotId: string
  contactId: string
  chatbot: ChatbotModel
}

export type ActionExecutionContext = {
  action: Record<string, unknown>
  contactId: string
  chatbotId: string
}
