import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { MetadataPayload } from "@chatbotx.io/flow-config"

// Kept apart from the reconciler registry so each reconciler can import the
// contract without importing the registry that imports it (no module cycle).

export type ChannelSendErrorContext = {
  error: unknown
  conversation: Pick<
    ConversationModel,
    "id" | "workspaceId" | "assignedUserId" | "assignedInboxTeamId"
  >
  contactInbox: ContactInboxModel
  contentAttributes: unknown
  /** The send job's payload tag (broadcast, sequence, flow node, ...). */
  metadata?: MetadataPayload
}

/**
 * Turns a channel-specific send failure that is really a permanent, known
 * outcome into local state. Returns `true` when it did — the caller still
 * records the failure but must not rethrow, since a retry would repeat a send
 * the channel has already answered for good.
 */
export type ChannelSendErrorReconciler = (
  context: ChannelSendErrorContext,
) => Promise<boolean>
