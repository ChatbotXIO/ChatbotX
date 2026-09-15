import { channelTypes } from "@chatbotx.io/database/partials"
import { whatsappCallPermissionRepository } from "@chatbotx.io/database/repositories"
import {
  ChannelError,
  getWhatsappCallPermissionRequest,
} from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"

/**
 * Meta error 138017 — a `call_permission_request` send is rejected because the
 * consumer has ALREADY granted the business a permanent call permission. It is
 * a success in disguise, not a real send failure: the business can already
 * call this consumer.
 *
 * Why this lives in the chat worker and not in the builder action that fires
 * the request: `messageService.createOutgoing` only ENQUEUES the channel send
 * (`packages/business/src/message/create-outgoing.ts`), so the action returns
 * before Meta is ever contacted and never sees 138017. The chat worker's
 * `sendMessageToChannel` is the only layer that observes Meta's response, so
 * the local permanent-grant is reconciled here.
 *
 * developers.facebook.com/documentation/business-messaging/whatsapp/calling/troubleshooting
 */
const PERMANENT_PERMISSION_ALREADY_EXISTS_CODE = 138_017

type CallPermissionGrantInput = {
  error: unknown
  workspaceId: string
  contactInbox: { id: string; channel: string }
  /** The outgoing message's `contentAttributes` — only a
   * `whatsapp_call_permission_request` is eligible. */
  contentAttributes: unknown
}

/**
 * Records the permanent permission when a WhatsApp `call_permission_request`
 * send failed with Meta 138017, and returns `true` to say the grant was
 * reconciled. Returns `false` for every other channel, message type, or error
 * code.
 *
 * `true` does NOT mean "swallow the error": the caller still surfaces the send
 * failure (the request never reached the consumer) — it only uses the flag to
 * broadcast a call-mode refresh and to avoid a terminal rethrow (138017 is
 * permanent, so a BullMQ retry would just re-POST to Meta). See
 * `sendMessageToChannel`.
 *
 * Idempotent: `upsertForContactInbox` is a newest-response-wins upsert, so a
 * redelivered job (or a later real `call_permission_reply`) can never regress
 * the grant.
 */
export async function recordCallPermissionAlreadyGranted(
  input: CallPermissionGrantInput,
): Promise<boolean> {
  if (input.contactInbox.channel !== channelTypes.enum.whatsapp) {
    return false
  }
  if (!getWhatsappCallPermissionRequest(input.contentAttributes)) {
    return false
  }
  if (
    !(input.error instanceof ChannelError) ||
    Number(input.error.code) !== PERMANENT_PERMISSION_ALREADY_EXISTS_CODE
  ) {
    return false
  }

  await whatsappCallPermissionRepository.upsertForContactInbox({
    workspaceId: input.workspaceId,
    contactInboxId: input.contactInbox.id,
    response: "accept",
    isPermanent: true,
    expiresAt: null,
    respondedAt: new Date(),
  })
  logger.info(
    { contactInboxId: input.contactInbox.id },
    "[wa-call-permission] 138017 on call_permission_request — recorded permanent grant and suppressed the failure",
  )
  return true
}
