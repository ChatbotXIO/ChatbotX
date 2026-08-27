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
  /**
   * The `ContactInbox` that owns the conversation/event that fired this
   * trigger, when the producer had one in scope. Preferred over the
   * contact's most-recently-active inbox by `resolveActionContactInbox` —
   * see that function's doc comment for which event types thread this and
   * which fall back by design.
   */
  contactInboxId?: string
}

/**
 * Second parameter of `TriggerExecutorService.execute` — the per-event
 * inputs threaded from the trigger worker's job data, distinct from the
 * `TriggerWithConditions` (the matched trigger definition) passed as the
 * first parameter.
 */
export type TriggerExecutionInput = {
  contactId: string
  contactInboxId?: string
}
