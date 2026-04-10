import { contactTrackingService } from "@chatbotx.io/analytics"
import { db, findOrFail } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
  attachmentModel,
  contactInboxModel,
  contactModel,
  conversationModel,
  messageModel,
  workspaceUsageModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  InboxModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import {
  emitContactCreated,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import { getStoragePrefix, uploader } from "@chatbotx.io/filesystem"
import {
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import {
  type AuthValue,
  type IncomingAttachment,
  type IncomingContact,
  SdkException,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  type IntegrationJobReceiveMessage,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  allIntegrations,
  integrationService,
} from "../../services/integrations"

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

  if (!Object.hasOwn(allIntegrations, integrationType)) {
    throw new Error(`Unsupported integration: ${integrationType}`)
  }

  const dbIntegration =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )
  const { inbox, integrationAuth } = dbIntegration
  const ctx = {
    auth: integrationAuth,
    uploader,
    storagePrefix: getStoragePrefix(inbox.workspaceId, inbox.id),
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

  const {
    message: incomingMessage,
    contact: incomingContact,
    postbackAction,
    quickReplyAction,
    ref,
  } = parsedMessage

  const { contactInbox, conversation } = await detectContactAndConversation({
    incomingContact,
    inbox,
    integrationAuth,
  })

  const { newMessage, isNewMessage } = await db.transaction(async (tx) => {
    // Create message and attachments
    const now = new Date()
    const newMessage = await tx
      .insert(messageModel)
      .values({
        id: createId(),
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        senderType:
          incomingMessage.messageType === "outgoing" ? "user" : "contact",
        workspaceId: inbox.workspaceId,
        sourceId: incomingMessage.sourceId,
        senderId:
          incomingMessage.messageType === "outgoing"
            ? null
            : contactInbox.contactId,
        messageType: incomingMessage.messageType,
        text: incomingMessage.text,
        contentType: incomingMessage.contentType,
        contentAttributes: incomingMessage.contentAttributes,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [messageModel.contactInboxId, messageModel.sourceId],
        set: {
          updatedAt: new Date(),
        },
      })
      .returning()
      .then((result) => result[0])

    const isNewMessage = newMessage.createdAt.getTime() === now.getTime()

    if (
      isNewMessage &&
      incomingMessage.attachments &&
      incomingMessage.attachments.length > 0
    ) {
      await tx.insert(attachmentModel).values(
        incomingMessage.attachments.map((attachment: IncomingAttachment) => ({
          id: createId(),
          ...attachment,
          messageId: newMessage.id,
          workspaceId: inbox.workspaceId,
          conversationId: conversation.id,
          url: getPublicUrl(attachment.originPath),
        })),
      )
    }

    try {
      broadcastToWorkspaceParty(inbox.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: newMessage,
      })
    } catch (error) {
      logger.warn(error, "Unable to emit realtime message")
    }

    return {
      newMessage,
      isNewMessage,
    }
  })

  if (isNewMessage) {
    contactTrackingService
      .trackEvent({
        workspaceId: inbox.workspaceId,
        contactId: contactInbox.contactId,
        eventType: "contact_message_in",
        senderType: "human",
        occurredAt: newMessage.createdAt,
        source: integrationType,
        sourceId: newMessage.sourceId,
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

    if (postbackAction) {
      await integrationQueue.add(IntegrationJobAction.runFlowPostback, {
        type: IntegrationJobAction.runFlowPostback,
        data: {
          conversationId: conversation.id,
          action: postbackAction,
          ref,
        },
      })
    }

    if (quickReplyAction) {
      await integrationQueue.add(IntegrationJobAction.runFlowQuickReply, {
        type: IntegrationJobAction.runFlowQuickReply,
        data: {
          conversationId: conversation.id,
          action: quickReplyAction,
          ref,
        },
      })
    }
  }

  return {
    message: newMessage,
    conversation,
    postbackAction,
    quickReplyAction,
    ref,
  }
}

const detectContactAndConversation = async (props: {
  inbox: InboxModel
  incomingContact: IncomingContact
  integrationAuth: AuthValue
}): Promise<{
  contactInbox: ContactInboxModel
  conversation: ConversationModel
}> => {
  const { incomingContact, inbox, integrationAuth } = props
  let contactData: typeof contactModel.$inferInsert = {
    ...incomingContact,
    workspaceId: inbox.workspaceId,
  }

  const { contactInbox, conversation, newContact } = await db.transaction(
    async (tx) => {
      let contactInbox: ContactInboxModel | null | undefined = null
      let conversation: ConversationModel | null | undefined = null
      let newContact: ContactModel | null | undefined = null

      contactInbox = await tx.query.contactInboxModel.findFirst({
        where: {
          channel: inbox.channel,
          sourceId: incomingContact.sourceId,
        },
      })

      if (contactInbox) {
        conversation = await findOrFail({
          table: conversationModel,
          where: {
            workspaceId: inbox.workspaceId,
            contactId: contactInbox.contactId,
          },
        })
      } else {
        if (canGetUserProfileIfNeeded(inbox.channel)) {
          const integration = allIntegrations[inbox.channel]
          if (integration && "getUserProfile" in integration.actions) {
            const userProfile = await integration.actions.getUserProfile({
              ctx: {
                storagePrefix: getStoragePrefix(inbox.workspaceId, inbox.id),
                auth: integrationAuth,
                uploader,
              },
              psid: incomingContact.sourceId,
            })
            contactData = {
              ...contactData,
              ...userProfile,
            }
          }
        }

        const workspaceUsage = await findOrFail({
          table: workspaceUsageModel,
          where: { workspaceId: inbox.workspaceId },
          message: "Workspace usage not found",
        })
        if (workspaceUsage.contactsCount >= workspaceUsage.maxContacts) {
          throw new Error("Max contacts reached")
        }

        newContact = await tx
          .insert(contactModel)
          .values({
            id: createId(),
            ...contactData,
            lastActivityAt: new Date(),
          })
          .returning()
          .then((result) => result[0])
        if (!newContact) {
          throw new Error("Contact not found")
        }

        contactInbox = await tx
          .insert(contactInboxModel)
          .values({
            id: createId(),
            inboxId: inbox.id,
            contactId: newContact.id,
            originalContactId: newContact.id,
            source: inbox.channel,
            sourceId: incomingContact.sourceId,
            channel: inbox.channel,
          })
          .returning()
          .then((result) => result[0])

        conversation = await tx
          .insert(conversationModel)
          .values({
            id: createId(),
            workspaceId: inbox.workspaceId,
            contactId: newContact.id,
          })
          .returning()
          .then((result) => result[0])
      }
      if (!contactInbox) {
        throw new Error("Contact inbox not found")
      }
      if (!conversation) {
        throw new Error("Conversation not found")
      }

      return { contactInbox, conversation, newContact }
    },
  )

  if (newContact) {
    try {
      await emitContactCreated(
        newContact.workspaceId,
        newContact.id,
        newContact.firstName || undefined,
        newContact.phoneNumber || undefined,
        newContact.email || undefined,
      )
    } catch (error) {
      console.error("Failed to emit contactCreated event:", error)
    }
    contactTrackingService
      .trackEvent({
        workspaceId: inbox.workspaceId,
        contactId: newContact.id,
        eventType: "contact_created",
        occurredAt: newContact.createdAt,
        source: contactInbox.channel,
        sourceId: contactInbox.sourceId,
        channel: contactInbox.channel,
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

  return { contactInbox, conversation }
}

const canGetUserProfileIfNeeded = (integrationType: string) =>
  integrationType === "messenger" || integrationType === "zalo"
