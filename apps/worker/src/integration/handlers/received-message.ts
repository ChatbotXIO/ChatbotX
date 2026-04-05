import {
  emitContactCreated,
  setWebhookExecutionContext,
} from "@chatbotx/events"
import { contactTrackingService } from "@chatbotx.io/analytics"
import { db, findOrFail } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
  attachmentModel,
  contactModel,
  conversationModel,
  messageModel,
  workspaceUsageModel,
} from "@chatbotx.io/database/schema"
import type {
  ContentType,
  ConversationModel,
  Gender,
  MessageModel,
} from "@chatbotx.io/database/types"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import { uploader } from "@chatbotx.io/filesystem"
import {
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import {
  type AuthValue,
  type Context,
  type IncomingAttachment,
  SdkException,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  type IntegrationJobReceiveMessage,
  integrationQueue,
} from "@chatbotx.io/worker-config"
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
  const { workspace, workspaceId, inboxId, auth, inbox } = dbIntegration
  const ctx = {
    workspace,
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
        workspaceId,
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

      const workspaceUsage = await findOrFail({
        table: workspaceUsageModel,
        where: { workspaceId },
        message: "Workspace usage not found",
      })
      if (workspaceUsage.contactsCount >= workspaceUsage.maxContacts) {
        throw new Error("Max contacts reached")
      }

      newContact = await tx
        .insert(contactModel)
        .values({
          id: createId(),
          workspaceId,
          sourceId: conversation.contact.sourceId,
          phoneNumber: conversation.contact.phoneNumber,
          email: conversation.contact.email,
          firstName: conversation.contact.firstName,
          lastName: conversation.contact.lastName,
          gender: (conversation.contact.gender as Gender) || "unknown",
          channel: integrationType,
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
        additionalAttributes: conversation.additionalAttributes,
        channel: inbox.channel,
        inboxId,
        workspaceId,
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
        workspaceId,
        sourceId: message.sourceId ?? "",
        senderId:
          message.messageType === "outgoing" ? null : (newContact?.id ?? ""),
        messageType: message.messageType,
        text: message.text,
        contentType: message.contentType as ContentType,
        contentAttributes: message.contentAttributes,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [messageModel.workspaceId, messageModel.sourceId],
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
          workspaceId: newConversation.workspaceId,
          conversationId: newConversation.id,
          url: getPublicUrl(attachment.originPath),
        })),
      )
    }

    try {
      broadcastToWorkspaceParty(newConversation.workspaceId, {
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
        workspaceId,
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
        workspaceId,
        contactId: conversation.contact.sourceId,
        eventType: "contact_created",
        occurredAt: result.message.createdAt,
        source: integrationType,
        sourceId: conversation.contact.sourceId,
        channel: inbox.channel,
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
        workspaceId,
        contactId: conversation.contact.sourceId,
        eventType: "contact_message_in",
        senderType: "human",
        occurredAt: result.message.createdAt,
        source: integrationType,
        sourceId: conversation.contact.sourceId,
        channel: inbox.channel,
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
      workspaceId,
      contactId: conversation.contact.sourceId,
      eventType: "contact_created",
      occurredAt: new Date(),
      source: integrationType,
      sourceId: conversation.contact.sourceId,
      channel: inbox.channel,
      country: undefined,
      metadata: {
        inboxId,
      },
    })
  }

  if (conversation.contact.sourceId && message.messageType === "incoming") {
    await contactTrackingService.trackEvent({
      workspaceId,
      contactId: conversation.contact.sourceId,
      eventType: "contact_message_in",
      occurredAt: new Date(),
      source: integrationType,
      sourceId: conversation.contact.sourceId,
      channel: inbox.channel,
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
