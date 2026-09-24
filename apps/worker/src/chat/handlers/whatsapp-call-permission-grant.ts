import {
  broadcastToWorkspaceParty,
  whatsappCallPermissionService,
} from "@chatbotx.io/business"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import {
  ChannelError,
  getWhatsappCallPermissionRequest,
} from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"
import type { ChannelSendErrorContext } from "./channel-send-error-reconcilers"

/**
 * Meta error 138017 — a call_permission_request send is rejected because the
 * consumer already granted a permanent call permission. A success in disguise,
 * not a real send failure.
 * Reconciled in the chat worker because messageService.createOutgoing only
 * enqueues the send; the worker is the only layer that sees Meta's answer.
 */
const PERMANENT_PERMISSION_ALREADY_EXISTS_CODE = 138_017

const isPermanentPermissionAlreadyGranted = (error: unknown): boolean =>
  error instanceof ChannelError &&
  Number(error.code) === PERMANENT_PERMISSION_ALREADY_EXISTS_CODE

/**
 * On a 138017 for a call_permission_request, records the permanent grant
 * and refreshes open threads' call control (there is no
 * call_permission_reply message to trigger that). Returning true doesn't
 * hide the send error shown to the caller; it only stops a retry from
 * re-POSTing a request Meta already answered permanently.
 */
export async function reconcileCallPermissionAlreadyGranted(
  context: ChannelSendErrorContext,
): Promise<boolean> {
  if (
    !(
      getWhatsappCallPermissionRequest(context.contentAttributes) &&
      isPermanentPermissionAlreadyGranted(context.error)
    )
  ) {
    return false
  }

  await whatsappCallPermissionService.recordPermanentGrant({
    workspaceId: context.conversation.workspaceId,
    contactInboxId: context.contactInbox.id,
    grantedAt: new Date(),
  })
  broadcastToWorkspaceParty(context.conversation.workspaceId, {
    eventType: RealtimeEventType.whatsappCallPermissionUpdated,
    data: { conversationId: context.conversation.id },
  })
  logger.info(
    { contactInboxId: context.contactInbox.id },
    "WhatsApp call permission already granted; recorded permanent grant",
  )
  return true
}
