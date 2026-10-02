import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import {
  RealtimeEventType,
  routeForConversation,
} from "@chatbotx.io/realtime-protocol"
import { contactService } from "../contact/service"
import { contactInboxService } from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import { logger } from "../logger"
import { queueWorkspaceRealtimeEvent } from "../platform/realtime-broadcast"

/**
 * The contact's DM conversation (`sourceId IS NULL`), created when this is
 * their first ever interaction. Unlike the flow path's resolver there is no
 * fallback to the comment conversation: a private DM written there would show
 * in the public comment thread.
 */
type DirectMessageConversationRef = {
  id: string
  assignedUserId: string | null
  assignedInboxTeamId: string | null
}

async function findOrCreateDirectMessageConversationId(props: {
  workspaceId: string
  contactId: string
}): Promise<DirectMessageConversationRef> {
  const existing = await conversationService.findDMByContact(props)
  if (existing) {
    return existing
  }

  return await conversationService.findOrCreate({
    ...props,
    sourceId: null,
  })
}

/**
 * Best-effort side effects that the chat pipeline runs after a delivered DM
 * (`sendMessageToChannel`). A failure in one must not stop the others or the
 * realtime push.
 */
async function applyDeliveredDirectMessageEffects(props: {
  workspaceId: string
  conversationId: string
  contactInbox: ContactInboxModel
  at: Date
}): Promise<void> {
  const { workspaceId, conversationId, contactInbox, at } = props

  try {
    await conversationService.markReadByOutbound({
      workspaceId,
      conversationId,
      inboxId: contactInbox.inboxId,
      readAt: at,
    })
  } catch (err) {
    logger.warn(
      { err, workspaceId, conversationId },
      "markReadByOutbound after a delivered private reply failed",
    )
  }

  try {
    await contactService.unblockIfBlocked({
      workspaceId,
      id: contactInbox.contactId,
    })
  } catch (err) {
    logger.warn(
      { err, workspaceId, contactId: contactInbox.contactId },
      "Auto-unblock after a delivered private reply failed",
    )
  }
}

/**
 * Records a direct message that was already sent inline (straight through the
 * channel's Send API, outside the chat pipeline) on a known conversation, with
 * the same bookkeeping a delivered DM gets there.
 *
 * Never throws: the message already left, and a throw would fail the caller's
 * job so a retry sends it a second time. Returns `null` when nothing was
 * recorded.
 */
export const recordDeliveredDirectMessage = async (props: {
  workspaceId: string
  conversationId: string
  assignedUserId?: string | null
  assignedInboxTeamId?: string | null
  contactInbox: ContactInboxModel
  text: string
  sourceId: string | null
  contentAttributes?: MessageModel["contentAttributes"]
}): Promise<MessageModel | null> => {
  const {
    workspaceId,
    conversationId,
    assignedUserId,
    assignedInboxTeamId,
    contactInbox,
    text,
    sourceId,
  } = props

  try {
    const repository = await createMessageRepository()

    const message = await repository.create({
      workspaceId,
      conversationId,
      contactInboxId: contactInbox.id,
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId,
      text,
      contentAttributes: props.contentAttributes,
      createdAt: new Date(),
    })

    const trackingInvalidation =
      await conversationService.recordOutboundMessageActivity({
        workspaceId,
        conversationId,
        contactInboxId: contactInbox.id,
        contactId: contactInbox.contactId,
        at: message.createdAt,
      })
    await Promise.all([
      trackingInvalidation
        ? contactInboxService.invalidateTracking(trackingInvalidation)
        : Promise.resolve(),
      conversationService.invalidate({ workspaceId, ids: [conversationId] }),
    ])
    // Outside a transaction, so it invalidates its own tracking cache.
    await contactInboxService.recordOutboundMessageSent({
      contactInboxId: contactInbox.id,
      contactId: contactInbox.contactId,
      workspaceId,
      at: message.createdAt,
    })

    await applyDeliveredDirectMessageEffects({
      workspaceId,
      conversationId,
      contactInbox,
      at: message.createdAt,
    })

    queueWorkspaceRealtimeEvent(workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: message,
      route: routeForConversation({ assignedUserId, assignedInboxTeamId }),
    })

    return message
  } catch (err) {
    logger.warn(
      { err, workspaceId, contactInboxId: contactInbox.id },
      "Failed to record a delivered direct message in the inbox",
    )
    return null
  }
}

/**
 * Records a comment-anchored private DM that was already sent inline on the
 * contact's DM conversation (see {@link recordDeliveredDirectMessage}).
 */
export const recordDeliveredPrivateReply = async (props: {
  workspaceId: string
  contactInbox: ContactInboxModel
  text: string
  sourceId: string | null
}): Promise<MessageModel | null> => {
  const { workspaceId, contactInbox } = props

  try {
    const conversation = await findOrCreateDirectMessageConversationId({
      workspaceId,
      contactId: contactInbox.contactId,
    })
    return await recordDeliveredDirectMessage({
      ...props,
      conversationId: conversation.id,
      assignedUserId: conversation.assignedUserId,
      assignedInboxTeamId: conversation.assignedInboxTeamId,
      contentAttributes: { isPrivateReply: true },
    })
  } catch (err) {
    logger.warn(
      { err, workspaceId, contactInboxId: contactInbox.id },
      "Failed to record a delivered private reply in the inbox",
    )
    return null
  }
}
