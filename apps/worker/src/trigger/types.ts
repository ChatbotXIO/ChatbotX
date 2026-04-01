import type {
  ChatbotModel,
  ConditionModel,
  TriggerModel,
} from "@chatbotx.io/database/types"

export type TriggerWithConditions = TriggerModel & {
  conditions: ConditionModel[]
  chatbot?: ChatbotModel | null
}

export type TriggerEventData = {
  chatbotId: bigint
  contactId: bigint
  eventType: number
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
}

export type ConditionEvaluationContext = {
  condition: TriggerWithConditions["conditions"][number]
  eventData: TriggerEventData
  chatbotId: bigint
  contactId: bigint
  chatbot: ChatbotModel
}

export type ActionExecutionContext = {
  action: Record<string, unknown>
  contactId: bigint
  chatbotId: bigint
}
