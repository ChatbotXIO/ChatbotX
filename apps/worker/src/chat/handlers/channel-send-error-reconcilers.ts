import { channelTypes } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { reconcileCallPermissionAlreadyGranted } from "./whatsapp-call-permission-grant"

export type ChannelSendErrorContext = {
  error: unknown
  conversation: Pick<ConversationModel, "id" | "workspaceId">
  contactInbox: Pick<ContactInboxModel, "id" | "channel">
  contentAttributes: unknown
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

const channelSendErrorReconcilers: Partial<
  Record<ContactInboxModel["channel"], ChannelSendErrorReconciler>
> = {
  [channelTypes.enum.whatsapp]: reconcileCallPermissionAlreadyGranted,
}

export async function reconcileChannelSendError(
  context: ChannelSendErrorContext,
): Promise<boolean> {
  const reconcile = channelSendErrorReconcilers[context.contactInbox.channel]
  return reconcile ? await reconcile(context) : false
}
