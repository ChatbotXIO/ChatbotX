import type { ContactInboxWorkspaceRow } from "@chatbotx.io/database/repositories"
import type { ConversationModel } from "@chatbotx.io/database/types"
import type {
  ActionExecutionContext,
  ActionExecutionOutcome,
} from "../../types"

export const succeeded: ActionExecutionOutcome = { status: "succeeded" }

export const skipped = (reason: string): ActionExecutionOutcome => ({
  status: "skipped",
  reason,
})

/**
 * Per-run memo shared by every action of one trigger/webhook run for one
 * contact. Without it each action re-queried the conversation and the contact
 * inbox (N actions = N identical lookups).
 */
export type TriggerActionScope = {
  getConversation: () => Promise<ConversationModel | undefined>
  getContactInbox: () => Promise<ContactInboxWorkspaceRow | null>
  /**
   * Conversation-state actions mutate the row; the next action must re-read it
   * instead of acting on a stale snapshot.
   */
  invalidateConversation: () => void
}

export type TriggerActionHandlerInput = {
  context: ActionExecutionContext
  conversation: ConversationModel
  scope: TriggerActionScope
}

export type TriggerActionHandler = (
  input: TriggerActionHandlerInput,
) => Promise<ActionExecutionOutcome>
