"use server"

import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  contactInboxService,
  contactService,
  conversationService,
  quotaEnforcementService,
  resolveTenantSettings,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  type ConversationAttributes,
  channelTypes,
} from "@chatbotx.io/database/partials"
import type { MessageWithAttachments } from "@chatbotx.io/database/repositories"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
  integrationWebchatModel,
} from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import { type UploadedFile, uploadMultipleFiles } from "@chatbotx.io/filesystem"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { createId } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { randomString } from "remeda"
import { logger } from "@/lib/log"
import { actionClient } from "@/lib/safe-action"
import {
  type CreateWebchatMessageRequest,
  createWebchatMessageRequest,
} from "../schema/mutation"

export const createWebchatMessageAction = actionClient
  .inputSchema(createWebchatMessageRequest)
  .action(handleCreateWebchatMessage)

export async function handleCreateWebchatMessage({
  parsedInput,
}: {
  parsedInput: CreateWebchatMessageRequest
}) {
  const { conversation, isNewContact, contact, contactInbox } =
    await getConversationFromInput(parsedInput)

  const { storageUrl } = await resolveTenantSettings({
    workspaceId: parsedInput.workspaceId,
  })

  // Process flow if exists
  if ("flowId" in parsedInput) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: parsedInput.flowId,
      },
    })
    return null
  }

  // Process ref if exists
  if ("initRef" in parsedInput && parsedInput.initRef) {
    await integrationQueue.add(IntegrationJobAction.runRef, {
      type: IntegrationJobAction.runRef,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        ref: parsedInput.initRef,
      },
    })
    return null
  }

  if ("postback" in parsedInput && parsedInput.postback) {
    await integrationQueue.add(IntegrationJobAction.runFlowPostback, {
      type: IntegrationJobAction.runFlowPostback,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        action: parsedInput.postback,
      },
    })
  }

  // Upload file if exists
  let uploadedFiles: UploadedFile[] = []
  if ("files" in parsedInput && parsedInput.files.length > 0) {
    uploadedFiles = await uploadMultipleFiles(
      parsedInput.files,
      `public/space/${parsedInput.workspaceId}/conversations/${conversation.id}`,
    )
  }

  if ("text" in parsedInput && (parsedInput.text || uploadedFiles.length > 0)) {
    const repository = await createMessageRepository()

    const now = new Date()
    const messageInput = {
      text: parsedInput.text ?? null,
      messageType: "incoming" as const,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      senderType: "contact" as const,
      senderId: conversation.contactId,
      contentType: "text" as const,
      contactInboxId: contactInbox.id,
      createdAt: now,
    }

    const attachmentInputs = uploadedFiles.map((file) => ({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      ...file,
    }))

    const message: MessageWithAttachments =
      attachmentInputs.length > 0
        ? await repository.createWithAttachments(messageInput, attachmentInputs)
        : { ...(await repository.create(messageInput)), attachments: [] }

    const newMessage = {
      ...message,
      attachments: message.attachments.map((attachment) => ({
        ...attachment,
        url: getPublicFileUrl(attachment.originPath, storageUrl),
      })),
    }

    await db
      .update(conversationModel)
      .set({
        contactLastReadAt: now,
        lastActivityAt: message.createdAt,
        contactRepliedAt: message.createdAt,
      })
      .where(eq(conversationModel.id, conversation.id))

    await db
      .update(contactInboxModel)
      .set({
        contactLastReadAt: now,
        lastMessageAt: message.createdAt,
        lastIncomingMessageAt: message.createdAt,
      })
      .where(eq(contactInboxModel.id, contactInbox.id))

    try {
      await contactService.unblockIfBlocked(
        { workspaceId: conversation.workspaceId, id: contactInbox.contactId },
        contact,
      )
    } catch (error) {
      logger.warn(
        { error, contactId: contactInbox.contactId, channel: "webchat" },
        "Auto-unblock on webchat inbound message failed",
      )
    }

    emit(messageEventTypeSchema.enum["message:received"], {
      workspaceId: conversation.workspaceId,
      contactId: contactInbox.contactId,
      contactInboxId: contactInbox.id,
      channel: channelTypes.enum.webchat,
      inboxId: contactInbox.inboxId,
      occurredAt: newMessage.createdAt ?? new Date(),
      sourceId: newMessage.sourceId ?? undefined,
    })

    const promises: Promise<unknown>[] = []
    promises.push(
      chatQueue.add(ChatJobAction.broadcastEvent, {
        type: ChatJobAction.broadcastEvent,
        data: {
          workspaceId: newMessage.workspaceId,
          event: {
            eventType: RealtimeEventType.messageCreated,
            data: {
              ...newMessage,
              clientId: parsedInput.clientId,
            },
          },
        },
      }),
    )

    const additionalAttributes =
      conversation.additionalAttributes as unknown as ConversationAttributes

    if (additionalAttributes?.challenge) {
      promises.push(
        integrationQueue.add(
          IntegrationJobAction.runChallenge,
          {
            type: IntegrationJobAction.runChallenge,
            data: {
              conversationId: conversation,
              contactInboxId: contactInbox,
              challenge: additionalAttributes?.challenge,
            },
          },
          {
            deduplication: {
              id: `conversation-${conversation.id}-challenge`,
            },
          },
        ),
      )
    } else if (
      newMessage.text &&
      !("postback" in parsedInput && parsedInput.postback) &&
      (await conversationService.ensureActive(conversation))
    ) {
      promises.push(
        automatedResponseService.enqueue({
          conversationId: conversation.id,
          contactInboxId: contactInbox.id,
          messageId: newMessage.id,
        }),
      )
    }

    if (isNewContact && contactInbox.sourceId) {
      emit("analytics:dashboard", {
        eventType: "contact:created",
        workspaceId: parsedInput.workspaceId,
        contactId: contactInbox.id,
        occurredAt: contact.createdAt,
        source: contactInbox.source,
        sourceId: contactInbox.sourceId,
        channel: contactInbox.channel,
        metadata: {
          triggerContext: {
            triggerSource: "api",
            triggerHandler: "createWebchatMessage",
            triggerType: "contact_created",
          },
        },
      })
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises)
    }

    return newMessage
  }

  return null
}

async function getConversationFromInput(
  parsedInput: CreateWebchatMessageRequest,
) {
  const integrationWebchat = await findOrFail({
    table: integrationWebchatModel,
    where: {
      workspaceId: parsedInput.workspaceId,
      id: parsedInput.webchatId,
    },
    message: "Channel not found",
  })

  const sourceId = parsedInput.guestConversationId

  const existingContactInbox = await contactInboxService.findLatestBySource({
    inboxId: integrationWebchat.inboxId,
    sourceId,
  })

  if (existingContactInbox) {
    const conversation = await conversationService.findBy({
      where: {
        workspaceId: parsedInput.workspaceId,
        contactId: existingContactInbox.contactId,
      },
    })
    const contact = await contactService.findById({
      workspaceId: parsedInput.workspaceId,
      id: existingContactInbox.contactId,
    })
    if (!conversation) {
      throw new ChatbotXException("Conversation not found")
    }
    if (!contact) {
      throw new ChatbotXException("Contact not found")
    }
    return {
      conversation,
      contact,
      contactInbox: existingContactInbox,
      isNewContact: false,
      workspaceOwnerId: null as string | null,
    }
  }

  // New contact. Resolve the owner (owner-derived, never request-derived) and
  // gate on MAC — the billing hard limit — atomically with the insert so
  // concurrent first-message requests cannot both pass the gate and overrun the
  // limit. MAC is consumed here (not via the async message event) and the
  // `ContactActiveMonthly` presence row written inside the same transaction so
  // the later `message:received` event dedups instead of double-counting. The
  // info-only `contacts` metric is recorded inside `createNewContactWithMac`.
  const ws = await workspaceService.find({
    where: { id: parsedInput.workspaceId },
  })
  if (!ws) {
    throw new ChatbotXException("Workspace not found", "notFound", 404)
  }

  const result = await quotaEnforcementService.createNewContactWithMac({
    ownerId: ws.ownerId,
    workspaceId: parsedInput.workspaceId,
    create: async (tx) => {
      const contact = await tx
        .insert(contactModel)
        .values({
          id: createId(),
          workspaceId: parsedInput.workspaceId,
          email: parsedInput.guestConversationId,
          gender: "unknown",
          firstName: "Guest",
          lastName: randomString(10),
        })
        .returning()
        .then((rows) => rows[0])
      if (!contact) {
        throw new ChatbotXException("Contact not found")
      }

      const contactInbox = await tx
        .insert(contactInboxModel)
        .values({
          id: createId(),
          inboxId: integrationWebchat.inboxId,
          contactId: contact.id,
          originalContactId: contact.id,
          source: "webchat",
          sourceId,
          channel: "webchat",
        })
        .returning()
        .then((rows) => rows[0])
      if (!contactInbox) {
        throw new ChatbotXException("Contact inbox not found")
      }

      const conversation = await tx
        .insert(conversationModel)
        .values({
          id: createId(),
          workspaceId: parsedInput.workspaceId,
          contactId: contact.id,
        })
        .returning()
        .then((rows) => rows[0])
      if (!conversation) {
        throw new ChatbotXException("Conversation not found")
      }

      return {
        value: { contact, contactInbox, conversation },
        contactId: contact.id,
        contactInboxId: contactInbox.id,
        inboxId: integrationWebchat.inboxId,
      }
    },
  })

  if (!result.ok) {
    throw new ChatbotXException("Contact limit reached", "quotaExceeded", 422)
  }

  return {
    conversation: result.value.conversation,
    contact: result.value.contact,
    contactInbox: result.value.contactInbox,
    isNewContact: true,
    workspaceOwnerId: ws.ownerId as string | null,
  }
}
