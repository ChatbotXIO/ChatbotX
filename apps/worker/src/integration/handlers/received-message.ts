import { db, findOrFail } from "@aha.chat/database/client"
import {
  attachmentModel,
  chatbotUsageModel,
  contactModel,
  conversationModel,
  messageModel,
} from "@aha.chat/database/schema"
import type {
  ChatbotUsageModel,
  ContentType,
  ConversationModel,
  Gender,
  IntegrationType,
  MessageModel,
} from "@aha.chat/database/types"
import { getPublicUrl } from "@aha.chat/database/utils"
import { uploader } from "@aha.chat/filesystem"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import {
  type AuthValue,
  type Context,
  type IncomingAttachment,
  SdkException,
} from "@aha.chat/sdk"
import {
  IntegrationJobAction,
  type IntegrationJobReceiveMessage,
  integrationQueue,
} from "@aha.chat/worker-config"
import {
  emitContactCreated,
  setWebhookExecutionContext,
} from "@chatbotx/events"
import { contactTrackingService } from "@chatbotx.io/analytics"
import { createId } from "@paralleldrive/cuid2"
import { allIntegrations, getDBIntegration } from "../../lib/integrations"
import { logger } from "../../lib/logger"

export const receiveMessage = async (
  props: IntegrationJobReceiveMessage["data"],
): Promise<{
  message: MessageModel
  conversation: ConversationModel
  postbackAction: string | null
  quickReplyAction: string | null
  ref?: string | null
}> => {
  setWebhookExecutionContext({ source: "webhook" })

  const { integrationType, integrationIdentifier } = props

  setWebhookExecutionContext({ source: "webhook" })

  if (!Object.hasOwn(allIntegrations, integrationType)) {
    throw new Error(`Unsupported integration: ${integrationType}`)
  }

  const dbIntegration = await getDBIntegration(
    integrationType as IntegrationType,
    integrationIdentifier,
  )
  const { chatbot, chatbotId, inboxId, auth, inbox } = dbIntegration
  const ctx = {
    chatbot,
    auth: auth as AuthValue,
    uploader,
  }

  const parsedMessage = await allIntegrations[
    integrationType
  ]?.channels?.channel?.message?.receiveMessage?.({
    ctx,
    data: props,
  })
  if (!parsedMessage) {
    throw new SdkException("Unable to parse received message")
  }

  const { message, conversation, postbackAction, quickReplyAction, ref } =
    parsedMessage

  const result = await db.transaction(async (tx) => {
    let newContact = await tx.query.contactModel.findFirst({
      where: {
        chatbotId,
        sourceId: conversation.contact.sourceId,
      },
    })

    let isNewContact = false
    if (!newContact) {
      if (canGetUserProfileIfNeeded(integrationType)) {
        const integration = allIntegrations[integrationType]
        if (integration && "getUserProfile" in integration.actions) {
          const userProfile = await integration.actions.getUserProfile({
            // biome-ignore lint/suspicious/noExplicitAny: safe pass value
            ctx: ctx as Context<any>,
            psid: conversation.contact.sourceId,
          })
          conversation.contact = {
            ...conversation.contact,
            ...userProfile,
          }
        }
      }

      const chatbotUsage = await findOrFail<ChatbotUsageModel>(
        chatbotUsageModel,
        { chatbotId },
        "Chatbot usage not found",
      )
      if (chatbotUsage.contactsCount >= chatbotUsage.maxContacts) {
        throw new Error("Max contacts reached")
      }

      newContact = await tx
        .insert(contactModel)
        .values({
          id: createId(),
          chatbotId,
          sourceId: conversation.contact.sourceId,
          phoneNumber: conversation.contact.phoneNumber,
          email: conversation.contact.email,
          firstName: conversation.contact.firstName,
          lastName: conversation.contact.lastName,
          gender: (conversation.contact.gender as Gender) || "unknown",
          source: integrationType,
          avatar: conversation.contact.avatar,
        })
        .returning()
        .then((result) => result[0])

      isNewContact = true
    }

    if (!newContact) {
      throw new Error("Contact not found")
    }

    const newConversation = await tx
      .insert(conversationModel)
      .values({
        id: createId(),
        sourceId: conversation.sourceId,
        conversationAttributes: conversation.conversationAttributes,
        inboxType: inbox.inboxType,
        inboxId,
        chatbotId,
        contactId: newContact.id,
      })
      .onConflictDoUpdate({
        target: [conversationModel.contactId],
        set: {
          updatedAt: new Date(),
          contactRepliedAt: new Date(),
          lastActivityAt: new Date(),
        },
      })
      .returning()
      .then((result) => result[0])

    const now = new Date()

    // Create message and attachments
    const newMessage = await tx
      .insert(messageModel)
      .values({
        id: createId(),
        conversationId: newConversation.id,
        inboxId,
        senderType: message.messageType === "outgoing" ? "user" : "contact",
        chatbotId,
        sourceId: message.sourceId ?? "",
        senderId:
          message.messageType === "outgoing" ? null : (newContact?.id ?? ""),
        messageType: message.messageType,
        content: message.content,
        contentType: message.contentType as ContentType,
        contentAttributes: message.contentAttributes,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [messageModel.chatbotId, messageModel.sourceId],
        set: {
          updatedAt: now,
        },
      })
      .returning()
      .then((result) => result[0])

    if (
      message.attachments &&
      message.attachments.length > 0 &&
      newMessage.createdAt.getTime() === now.getTime()
    ) {
      await tx.insert(attachmentModel).values(
        message.attachments.map((attachment: IncomingAttachment) => ({
          id: createId(),
          ...attachment,
          messageId: newMessage.id,
          chatbotId: newConversation.chatbotId,
          conversationId: newConversation.id,
          url: getPublicUrl(attachment.originPath),
        })),
      )
    }

    try {
      broadcastToChatbotParty(newConversation.chatbotId, {
        eventType: RealtimeEventType.messageCreated,
        data: newMessage,
      })
    } catch (error) {
      logger.warn(error, "Unable to emit realtime message")
    }

    return {
      message: newMessage,
      conversation: newConversation,
      isNewContact,
      contactId: newContact.id,
      contactData: isNewContact
        ? {
            name: newContact.firstName,
            phone: newContact.phoneNumber,
            email: newContact.email,
          }
        : undefined,
    }
  })

  // Emit contact created event if new contact
  if (result.isNewContact && result.contactData) {
    try {
      await emitContactCreated(
        chatbotId,
        result.contactId,
        result.contactData.name || undefined,
        result.contactData.phone || undefined,
        result.contactData.email || undefined,
      )
    } catch (error) {
      console.error("Failed to emit contactCreated event:", error)
    }
    contactTrackingService
      .trackEvent({
        chatbotId,
        contactId: conversation.contact.sourceId,
        eventType: "contact_created",
        occurredAt: result.message.createdAt,
        source: integrationType,
        sourceId: conversation.contact.sourceId,
        channel: inbox.inboxType,
        metadata: {
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "receiveMessage",
            triggerType: "contact_created",
          },
        },
      })
      .catch((error) => {
        logger.error(error, "[receiveMessage] Failed to track contact_created")
      })
  }

  if (conversation.contact.sourceId) {
    contactTrackingService
      .trackEvent({
        chatbotId,
        contactId: conversation.contact.sourceId,
        eventType: "contact_message_in",
        senderType: "human",
        occurredAt: result.message.createdAt,
        source: integrationType,
        sourceId: conversation.contact.sourceId,
        channel: inbox.inboxType,
        metadata: {
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "receiveMessage",
            triggerType: "contact_message_in",
          },
        },
      })
      .catch((error) => {
        logger.error(
          error,
          "[receiveMessage] Failed to track contact_message_in",
        )
      })
  }

  if (postbackAction) {
    await integrationQueue.add(IntegrationJobAction.runFlowPostback, {
      type: IntegrationJobAction.runFlowPostback,
      data: {
        conversationId: result.conversation.id,
        action: postbackAction,
        ref,
      },
    })
  }

  if (quickReplyAction) {
    await integrationQueue.add(IntegrationJobAction.runFlowQuickReply, {
      type: IntegrationJobAction.runFlowQuickReply,
      data: {
        conversationId: result.conversation.id,
        action: quickReplyAction,
        ref,
      },
    })
  }

  if (result.isNewContact && conversation.contact.sourceId) {
    await contactTrackingService.trackEvent({
      chatbotId,
      contactId: conversation.contact.sourceId,
      eventType: "contact_created",
      occurredAt: new Date(),
      source: integrationType,
      sourceId: conversation.contact.sourceId,
      channel: inbox.inboxType,
      country: undefined,
      metadata: {
        inboxId,
      },
    })
  }

  if (conversation.contact.sourceId && message.messageType === "incoming") {
    await contactTrackingService.trackEvent({
      chatbotId,
      contactId: conversation.contact.sourceId,
      eventType: "contact_message_in",
      occurredAt: new Date(),
      source: integrationType,
      sourceId: conversation.contact.sourceId,
      channel: inbox.inboxType,
      country: undefined,
      metadata: {
        inboxId,
        messageId: result.message.id,
      },
    })
  }

  return {
    message: result.message,
    conversation: result.conversation,
    postbackAction,
    quickReplyAction,
    ref,
  }
}

const canGetUserProfileIfNeeded = (integrationType: string) =>
  integrationType === "messenger" || integrationType === "zalo"
