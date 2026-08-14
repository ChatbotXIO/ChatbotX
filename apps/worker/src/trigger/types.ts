import type { TriggerEventType } from "@chatbotx.io/database/partials"
import type {
  ConditionModel,
  TriggerModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"

export type TriggerWithConditions = TriggerModel & {
  conditions: ConditionModel[]
  workspace?: WorkspaceModel | null
}

export type TriggerEventData = {
  workspaceId: string
  contactId: string
  eventType: TriggerEventType
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
  channelOriginated?: boolean
}

export type ConditionEvaluationContext = {
  condition: TriggerWithConditions["conditions"][number]
  eventData: TriggerEventData
  workspaceId: string
  contactId: string
  workspace: WorkspaceModel
}

export type ActionExecutionContext = {
  action: Record<string, unknown>
  contactId: string
  triggerId: string
  workspaceId: string
}
