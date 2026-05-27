import { broadcastToWorkspaceParty, buildContext } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
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
import { emit } from "@chatbotx.io/event-bus"
import {
  emitContactCreated,
  emitConversationOpened,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
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

  // Detecta reaction recebida do contato. WhatsApp envia reaction como
  // mensagem tipo "reaction" — em vez de criar mensagem nova, atualizamos
  // a Message alvo (sourceId === reaction.message_id) com
  // contentAttributes.reaction = { emoji, by: "contact", at }. UI renderiza
  // emoji embaixo da bubble. 2026-05-26 — Sprint WhatsApp reactions.
  const reactionAttrs = incomingMessage?.contentAttributes as
    | {
        type?: string
        targetMessageSourceId?: string
        emoji?: string
      }
    | undefined
  if (
    reactionAttrs?.type === "reaction" &&
    reactionAttrs.targetMessageSourceId
  ) {
    const targetMessage = await db.query.messageModel.findFirst({
      where: {
        contactInboxId: contactInbox.id,
        sourceId: reactionAttrs.targetMessageSourceId,
      },
    })
    if (targetMessage) {
      const prevAttrs =
        (targetMessage.contentAttributes as Record<string, unknown>) ?? {}
      const emoji = reactionAttrs.emoji ?? ""
      const newAttrs = {
        ...prevAttrs,
        // Reação removida (Meta envia emoji vazio quando contato remove): apaga.
        ...(emoji
          ? { reaction: { emoji, by: "contact", at: new Date().toISOString() } }
          : { reaction: null }),
      }
      const [updated] = await db
        .update(messageModel)
        .set({ contentAttributes: newAttrs })
        .where(eq(messageModel.id, targetMessage.id))
        .returning()
      if (updated) {
        try {
          broadcastToWorkspaceParty(inbox.workspaceId, {
            eventType: RealtimeEventType.messageReactionUpdated,
            data: {
              messageId: updated.id,
              conversationId: updated.conversationId,
              reaction: emoji
                ? {
                    emoji,
                    by: "contact" as const,
                    at: new Date().toISOString(),
                  }
                : null,
            },
          })
        } catch (err) {
          logger.warn(err, "Unable to emit reaction realtime event")
        }
      }
    }
    // Reaction não cria Message, não dispara automated response, sai aqui.
    return {
      message: null,
      conversation,
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    }
  }

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

    // Atualiza timestamps da conversation quando mensagem é incoming —
    // contactRepliedAt + lastActivityAt. Crítico pro detector da janela
    // de 24h do composer WhatsApp: sem isso, banner "Janela fechada"
    // aparece mesmo logo após o contato responder. 2026-05-26 — Sprint
    // WhatsApp 24h fix.
    if (isNewMessage && incomingMessage.messageType === "incoming") {
      const now = new Date()
      try {
        await db
          .update(conversationModel)
          .set({
            contactRepliedAt: now,
            lastActivityAt: now,
          })
          .where(eq(conversationModel.id, conversation.id))
      } catch (err) {
        logger.warn(err, "Unable to update conversation timestamps")
      }
    }

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

  // Sinalizadores pra emitir conversationOpened FORA da transaction (evita
  // race com triggers/webhooks que dependem do estado já commitado).
  let wasNewConversation = false
  let wasReopenedConversation = false

  const { contactInbox, conversation, newContact } = await db.transaction(
    async (tx) => {
      let contactInbox: ContactInboxModel | null | undefined = null
      let conversation: ConversationModel | null | undefined = null
      let newContact: ContactModel | null | undefined = null

      contactInbox = await tx.query.contactInboxModel.findFirst({
        where: {
          inboxId: inbox.id,
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

        // Reabertura: contato voltou a mandar msg numa conversa arquivada.
        // Limpa archivedAt e marca pra emitir conversationOpened.
        if (conversation.archivedAt) {
          await tx
            .update(conversationModel)
            .set({ archivedAt: null })
            .where(eq(conversationModel.id, conversation.id))
          conversation = { ...conversation, archivedAt: null }
          wasReopenedConversation = true
        }
      } else {
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

        const workspaceUsage = await findOrFail({
          table: workspaceUsageModel,
          where: { workspaceId: inbox.workspaceId },
          message: "Uso do workspace não encontrado",
        })
        if (workspaceUsage.contactsCount >= workspaceUsage.maxContacts) {
          throw new Error("Limite máximo de contatos atingido")
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
        wasNewConversation = true
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

  // Emit conversationOpened pro TriggerNode "Conversa Aberta".
  //  - Nova conversa criada agora → source = "contact" (1ª msg do contato)
  //  - Conversa reaberta (estava arquivada e o contato voltou a falar)
  //    → também emite com source = "contact". Esse é o caso mais útil pra
  //    automações de re-engajamento.
  if (wasNewConversation || wasReopenedConversation) {
    try {
      await emitConversationOpened(
        conversation.workspaceId,
        conversation.contactId,
        conversation.id,
        "contact",
        contactInbox.channel,
      )
    } catch (error) {
      logger.error(error, "[receiveMessage] Failed to emit conversationOpened")
    }
  }

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
