import {
  broadcastToWorkspaceParty,
  buildContext,
  resolvePlatformSettings,
  updateContactFromMessage,
  userQuotaService,
  workspaceService,
} from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
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
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import type { IncomingAttachment } from "@chatbotx.io/sdk"
import {
  type AuthValue,
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
  await resolvePlatformSettings({
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

  const detected = await detectContactAndConversation({
    incomingContact,
    inbox,
    integrationRow,
  })
  if (!detected) {
    throw new SdkException("Unable to resolve contact and conversation")
  }
  const { contactInbox, conversation } = detected

  // Overwrite Contact.phoneNumber/email from message text — every inbound
  // channel. Unconditional: the customer just typed the value, so it's
  // treated as fresher truth than any prior column value.
  //
  // Guarded on messageType !== 'outgoing' so bot/agent-authored text never
  // feeds the libphonenumber extractor (would otherwise false-positive on
  // long order/ticket IDs in templated outbound messages).
  if (incomingMessage?.text && incomingMessage.messageType !== "outgoing") {
    try {
      await updateContactFromMessage({
        contactId: contactInbox.contactId,
        workspaceId: inbox.workspaceId,
        text: incomingMessage.text,
      })
    } catch (error) {
      logger.warn(
        { error, contactId: contactInbox.contactId, channel: inbox.channel },
        "Contact update from message text failed",
      )
    }
  }

  let createdMessage: MessageModel | null = null
  if (incomingMessage) {
    const repository = await createMessageRepository()

    const messageInput = {
      id: createId(),
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      senderType:
        incomingMessage.messageType === "outgoing"
          ? ("user" as const)
          : ("contact" as const),
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
      createdAt: new Date(),
    }

    const attachmentInputs =
      incomingMessage.attachments?.map((attachment: IncomingAttachment) => ({
        ...attachment,
        workspaceId: inbox.workspaceId,
        conversationId: conversation.id,
      })) ?? []

    let messageWithAttachments: MessageModel & { attachments: unknown[] }
    let isNewMessage: boolean

    if (attachmentInputs.length > 0) {
      const result = await repository.createOrUpdateWithAttachments(
        messageInput,
        attachmentInputs,
      )
      messageWithAttachments = result.result
      isNewMessage = result.isNew
    } else {
      const result = await repository.createOrUpdate(messageInput)
      messageWithAttachments = { ...result.message, attachments: [] }
      isNewMessage = result.isNew
    }

    const newMessage = messageWithAttachments

    if (isNewMessage) {
      const lastMessageUpdate: Partial<typeof contactInboxModel.$inferInsert> =
        {
          lastMessageAt: newMessage.createdAt,
        }

      if (incomingMessage.messageType !== "outgoing") {
        lastMessageUpdate.lastIncomingMessageAt = newMessage.createdAt
      }

      await db
        .update(contactInboxModel)
        .set(lastMessageUpdate)
        .where(eq(contactInboxModel.id, contactInbox.id))
    }

    try {
      broadcastToWorkspaceParty(inbox.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: newMessage,
      })
    } catch (error) {
      logger.warn(error, "Unable to emit realtime message")
    }

    if (isNewMessage) {
      createdMessage = newMessage

      emit(messageEventTypeSchema.enum["message:received"], {
        workspaceId: inbox.workspaceId,
        contactId: contactInbox.contactId,
        contactInboxId: contactInbox.id,
        channel: inbox.channel,
        inboxId: inbox.id,
        occurredAt: newMessage.createdAt,
        sourceId: newMessage.sourceId ?? undefined,
      })

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
      })
    }
  }

  return { contactInbox, conversation }
}

const canGetUserProfileIfNeeded = (integrationType: string) =>
  integrationType === "messenger" ||
  integrationType === "zalo" ||
  integrationType === "telegram"
