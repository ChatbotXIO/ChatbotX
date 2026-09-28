import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { contactService } from "../contact/service"
import { contactInboxService } from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import { logger } from "../logger"
import { publishToWorkspaceParty } from "../platform/realtime-broadcast"

/**
 * The contact's DM conversation (`sourceId IS NULL`), created when this is
 * their first ever interaction. Unlike the flow path's resolver there is no
 * fallback to the comment conversation: a private DM written there would show
 * in the public comment thread.
 */
async function findOrCreateDirectMessageConversationId(props: {
  workspaceId: string
  contactId: string
}): Promise<string> {
  const existing = await conversationService.findDMByContact(props)
  if (existing) {
    return existing.id
  }

  const created = await conversationService.findOrCreate({
    ...props,
    sourceId: null,
  })
  return created.id
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
 * Records a comment-anchored private DM that was already sent inline (straight
 * through the channel's Send API, outside the chat pipeline) on the contact's
 * DM conversation, with the same bookkeeping a delivered DM gets there.
 *
 * Never throws: the DM already left, and a throw would fail the caller's job
 * so a retry sends it a second time. Returns `null` when nothing was recorded.
 */
export const recordDeliveredPrivateReply = async (props: {
  workspaceId: string
  contactInbox: ContactInboxModel
  text: string
  sourceId: string | null
}): Promise<MessageModel | null> => {
  const { workspaceId, contactInbox, text, sourceId } = props

  try {
    const [conversationId, repository] = await Promise.all([
      findOrCreateDirectMessageConversationId({
        workspaceId,
        contactId: contactInbox.contactId,
      }),
      createMessageRepository(),
    ])

    const message = await repository.create({
      workspaceId,
      conversationId,
      contactInboxId: contactInbox.id,
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId,
      text,
      contentAttributes: { isPrivateReply: true },
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

    publishToWorkspaceParty(workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: message,
    })

    return message
  } catch (err) {
    logger.warn(
      { err, workspaceId, contactInboxId: contactInbox.id },
      "Failed to record a delivered private reply in the inbox",
    )
    return null
  }
}
