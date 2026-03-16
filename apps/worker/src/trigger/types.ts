import type {
  ChatbotModel,
  ConditionModel,
  TriggerModel,
} from "@aha.chat/database/types"

export type TriggerWithConditions = TriggerModel & {
  conditions: ConditionModel[]
  chatbot?: ChatbotModel | null
}

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
