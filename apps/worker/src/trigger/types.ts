import type { TriggerEventType } from "@chatbotx.io/database/partials"
import type {
  ConditionModel,
  TriggerModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import type { DecisionFlowOrigin } from "@chatbotx.io/events"

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

/** What asked for the action to run; scopes dedup keys and attributes failures. */
export type ActionSource =
  | { kind: "trigger"; triggerId: string }
  | { kind: "inboundWebhook"; inboundWebhookId: string }

/**
 * How one action ended. A failure throws; anything that returns was handled,
 * and `skipped` says it did nothing (no conversation, inactive flow, …) so the
 * caller can tell that apart from an action that ran.
 */
export type ActionExecutionOutcome =
  | { status: "succeeded" }
  | { status: "skipped"; reason: string }

export type ActionExecutionContext = {
  action: Record<string, unknown>
  contactId: string
  source: ActionSource
  workspaceId: string
  /**
   * The `ContactInbox` that owns the conversation/event that fired this
   * trigger, when the producer had one in scope. Preferred over the
   * contact's most-recently-active inbox by `resolveActionContactInbox` —
   * see that function's doc comment for which event types thread this and
   * which fall back by design.
   */
  contactInboxId?: string
  decisionFlowOrigin?: DecisionFlowOrigin
  /**
   * Durable key of this occurrence of the action: identical on every retry of
   * the job that produced it, different for each run and each action. Unset
   * when the producer has no such key; `event` dedup then refuses to record.
   */
  occurrenceKey?: string
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
  decisionFlowOrigin?: DecisionFlowOrigin
  /** The trigger queue job id; stable across retries of that job. */
  occurrenceId?: string
}
