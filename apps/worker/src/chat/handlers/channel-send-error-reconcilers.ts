import { channelTypes } from "@chatbotx.io/database/partials"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import type {
  ChannelSendErrorContext,
  ChannelSendErrorReconciler,
} from "./channel-send-error-types"
import { reconcileMessengerThreadControlRejection } from "./messenger-thread-control-rejection"
import { reconcileCallPermissionAlreadyGranted } from "./whatsapp-call-permission-grant"
import { reconcileThreadControlRejection } from "./whatsapp-thread-control-rejection"

const channelSendErrorReconcilers: Partial<
  Record<ContactInboxModel["channel"], ChannelSendErrorReconciler[]>
> = {
  [channelTypes.enum.whatsapp]: [
    reconcileCallPermissionAlreadyGranted,
    reconcileThreadControlRejection,
  ],
  [channelTypes.enum.messenger]: [reconcileMessengerThreadControlRejection],
}

/**
 * Runs every reconciler registered for the channel (each one inspects the
 * error and ignores what is not its own); `true` when any of them reconciled.
 */
export async function reconcileChannelSendError(
  context: ChannelSendErrorContext,
): Promise<boolean> {
  const reconcilers =
    channelSendErrorReconcilers[context.contactInbox.channel] ?? []
  let isReconciled = false
  for (const reconcile of reconcilers) {
    isReconciled = (await reconcile(context)) || isReconciled
  }
  return isReconciled
}
