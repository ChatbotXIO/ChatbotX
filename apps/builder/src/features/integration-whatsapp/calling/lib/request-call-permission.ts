import {
  contactInboxService,
  type conversationService,
  messageService,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type { UserModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { invalidateCacheKeys } from "@chatbotx.io/redis"
import type { MessageWhatsappCallPermissionRequestEntity } from "@chatbotx.io/sdk"
import { logger } from "@/lib/log"
import { resolveDialIdentity } from "../actions/outbound-dial-target"
import {
  canSendCallPermissionRequest,
  metaCallPermissionCacheKey,
  readMetaCallPermissions,
} from "./meta-call-permission"

export type CallPermissionMessages = {
  notWhatsappConversation: string
  notFound: string
  /** Fallback when Meta's own check failed with no usable text. */
  permissionCheckFailed: string
  permissionRequestLimitReached: string
}

export const ENGLISH_CALL_PERMISSION_MESSAGES: CallPermissionMessages = {
  notWhatsappConversation: "This conversation is not on WhatsApp.",
  notFound: "WhatsApp channel not found",
  permissionCheckFailed:
    "Could not check the customer's call permission with Meta. Try again.",
  permissionRequestLimitReached:
    "Meta allows one call-permission request per 24 hours and two per 7 days for each customer: the limit is reached.",
}

/**
 * Sends Meta's `call_permission_request` interactive into a WhatsApp
 * conversation the caller already loaded and authorized. The customer's answer
 * flows back as a `call_permission_reply` and is persisted per contact — the
 * state future business-initiated calls gate on. Subject to Meta's per-customer
 * limits (1/24h, 2/7 days), checked against Meta's own counter because the send
 * is enqueued and a rejection would otherwise surface in the worker with
 * nobody to read it. `user` is the sending agent, or absent for a
 * workspace-token call (recorded as an API message).
 */
export async function requestWhatsappCallPermission(props: {
  workspaceId: string
  conversation: Awaited<ReturnType<typeof conversationService.findByOrFail>>
  text: string
  inboxId?: string
  user?: UserModel
  messages: CallPermissionMessages
}): Promise<void> {
  const { workspaceId, conversation, messages } = props

  // Prefer the caller's `inboxId` to pin the send to the number being viewed (a
  // contact can have WhatsApp ContactInbox rows on several connected numbers).
  // Falls back to a contact + channel lookup when that pin finds nothing.
  const contactInbox =
    (props.inboxId
      ? await contactInboxService.findBy({
          where: {
            contactId: conversation.contactId,
            channel: channelTypes.enum.whatsapp,
            inboxId: props.inboxId,
          },
        })
      : null) ??
    (await contactInboxService.findBy({
      where: {
        contactId: conversation.contactId,
        channel: channelTypes.enum.whatsapp,
      },
    }))
  if (!contactInbox) {
    throw new ChatbotXException(messages.notWhatsappConversation)
  }

  const integration =
    await integrationWhatsappRepository.findByInboxIdForWorkspace({
      workspaceId,
      inboxId: contactInbox.inboxId,
    })
  if (!integration) {
    throw new ChatbotXException(messages.notFound, "notFound", 404)
  }

  const { permissionTarget } = resolveDialIdentity(contactInbox)
  const permissions = await readMetaCallPermissions({
    auth: integration.auth as WhatsappAuthValue,
    integrationId: integration.id,
    contactInboxId: contactInbox.id,
    target: permissionTarget,
  })
  // Whatever Meta said leads — it names the real reason. Fails closed either
  // way: a check that never ran is not evidence of remaining budget.
  if (!permissions.ok) {
    throw new ChatbotXException(
      toPublicErrorMessage(permissions.error, messages.permissionCheckFailed),
    )
  }
  if (!canSendCallPermissionRequest(permissions.permissions)) {
    throw new ChatbotXException(messages.permissionRequestLimitReached)
  }

  const entity: MessageWhatsappCallPermissionRequestEntity = {
    type: "whatsapp_call_permission_request",
  }

  // The channel send is enqueued, not awaited, so a Meta 138017 ("permanent
  // permission already exists") surfaces in the worker, which reconciles it.
  await messageService.createOutgoing({
    conversation,
    contactInbox,
    input: { text: props.text, contentAttributes: entity },
    user: props.user,
  })

  // Best effort: drop the cached Meta counter so the next call re-reads Meta.
  // The send is already queued, so a cache failure must not fail the request.
  try {
    await invalidateCacheKeys(
      metaCallPermissionCacheKey(integration.id, contactInbox.id),
    )
  } catch (error) {
    logger.warn(
      { err: error, integrationId: integration.id },
      "Could not invalidate the call-permission cache",
    )
  }
}
