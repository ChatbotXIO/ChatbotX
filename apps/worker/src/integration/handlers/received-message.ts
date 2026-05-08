import {
  broadcastToWorkspaceParty,
  buildContext,
  resolvePlatformSettings,
  userQuotaService,
  workspaceService,
} from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db, findOrFail } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
  attachmentModel,
  contactInboxModel,
  contactModel,
  conversationModel,
  messageModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  InboxModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import {
  emitContactCreated,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import {
  type AuthValue,
  type IncomingAttachment,
  type IncomingContact,
  type MessageWhatsappFlowResponseEntity,
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
  message: MessageModel | null
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
  const { inbox, integrationRow } = dbIntegration
  const integration = allIntegrations[integrationType]
  if (!integration) {
    throw new SdkException(
      `No integration registered for channel: ${integrationType}`,
    )
  }
  const { storageUrl } = await resolvePlatformSettings({
    workspaceId: inbox.workspaceId,
  })
  const ctx = await buildContext({
    workspaceId: inbox.workspaceId,
    integrationType,
    integration: integrationRow,
  })

  const parsedMessage = await integration.runChannelHandler(
    "message",
    "receiveMessage",
    { ctx, data: props },
  )
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
    integrationRow,
  })

  let createdMessage: MessageModel | null = null
  if (incomingMessage) {
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
            url: getPublicFileUrl(attachment.originPath, storageUrl),
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
      // re-assign if is new message
      createdMessage = newMessage

      if (postbackAction) {
        await integrationQueue.add(IntegrationJobAction.runFlowPostback, {
          type: IntegrationJobAction.runFlowPostback,
          data: {
            conversationId: conversation,
            contactInboxId: contactInbox,
            action: postbackAction,
            ref,
            messageId: createdMessage?.id,
            payload: {
              waFlowResponse:
                (
                  incomingMessage.contentAttributes as MessageWhatsappFlowResponseEntity
                )?.flowResponse || "",
            },
          },
        })
      }

      if (quickReplyAction) {
        await integrationQueue.add(IntegrationJobAction.runFlowQuickReply, {
          type: IntegrationJobAction.runFlowQuickReply,
          data: {
            conversationId: conversation,
            contactInboxId: contactInbox,
            action: quickReplyAction,
            ref,
            messageId: createdMessage?.id,
          },
        })
      }
    }
  }

  if (ref) {
    await integrationQueue.add(IntegrationJobAction.runRef, {
      type: IntegrationJobAction.runRef,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        ref,
        messageId: createdMessage?.id,
      },
    })
  }

  return {
    message: createdMessage,
    conversation,
    postbackAction,
    quickReplyAction,
    ref,
  }
}

const detectContactAndConversation = async (props: {
  inbox: InboxModel
  incomingContact: IncomingContact
  integrationRow: {
    id: string
    auth: AuthValue
    inboxId: string
    [x: string]: unknown
  }
}): Promise<{
  contactInbox: ContactInboxModel
  conversation: ConversationModel
}> => {
  const { incomingContact, inbox, integrationRow } = props
  let contactData: typeof contactModel.$inferInsert = {
    ...incomingContact,
    workspaceId: inbox.workspaceId,
  }

  const existingContactInbox = await db.query.contactInboxModel.findFirst({
    where: {
      inboxId: inbox.id,
      channel: inbox.channel,
      sourceId: incomingContact.sourceId,
    },
  })

  let workspaceOwnerId: string | null = null
  if (!existingContactInbox) {
    if (canGetUserProfileIfNeeded(inbox.channel)) {
      const profileIntegration = allIntegrations[inbox.channel]
      if (profileIntegration) {
        const profileCtx = await buildContext({
          workspaceId: inbox.workspaceId,
          integrationType: inbox.channel,
          integration: integrationRow,
        })
        const userProfile = await profileIntegration.runChannelHandler(
          "contact",
          "getProfile",
          {
            ctx: profileCtx,
            data: { sourceId: incomingContact.sourceId },
          },
        )
        contactData = {
          ...contactData,
          ...userProfile,
        }
      }
    }

    const ws = await workspaceService.find({ where: { id: inbox.workspaceId } })
    if (!ws) {
      throw new Error("Workspace not found")
    }
    workspaceOwnerId = ws.ownerId

    if (await userQuotaService.isLimitReached(ws.ownerId, "contacts")) {
      throw new Error("Contact limit reached")
    }
  }

  const { contactInbox, conversation, newContact } = await db.transaction(
    async (tx) => {
      let contactInbox: ContactInboxModel | null | undefined = null
      let conversation: ConversationModel | null | undefined = null
      let newContact: ContactModel | null | undefined = null

      if (existingContactInbox) {
        contactInbox = existingContactInbox
        conversation = await findOrFail({
          table: conversationModel,
          where: {
            workspaceId: inbox.workspaceId,
            contactId: contactInbox.contactId,
          },
        })
      } else {
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

  if (newContact && workspaceOwnerId) {
    await userQuotaService.increment(workspaceOwnerId, "contacts")
  }

  if (newContact) {
    await emitContactCreated(
      newContact.workspaceId,
      newContact.id,
      newContact.firstName || undefined,
      newContact.phoneNumber || undefined,
      newContact.email || undefined,
    )

    if (contactInbox.sourceId) {
      emit("analytics:dashboard", {
        eventType: "contact:created",
        workspaceId: newContact.workspaceId,
        contactId: contactInbox.id,
        occurredAt: newContact.createdAt,
        source: contactInbox.source,
        sourceId: contactInbox.sourceId,
        channel: contactInbox.channel,
        metadata: {
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "receiveMessage",
            triggerType: "contact_created",
          },
        },
      }).catch((error) => {
        logger.error(error, "[receiveMessage] Failed to emit contact:created")
      })
    }
  }

  return { contactInbox, conversation }
}

const canGetUserProfileIfNeeded = (integrationType: string) =>
  integrationType === "messenger" ||
  integrationType === "zalo" ||
  integrationType === "telegram"
