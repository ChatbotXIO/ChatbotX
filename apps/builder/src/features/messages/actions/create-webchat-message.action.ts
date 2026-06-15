"use server"

import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  conversationService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import {
  db,
  eq,
  findOrFail,
  type Transaction,
} from "@chatbotx.io/database/client"
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
import type {
  ContactModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
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
    await db.transaction(
      async (tx) => await getConversationFromInput(tx, parsedInput),
    )

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
  tx: Transaction,
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

  let isNewContact = false
  const sourceId = parsedInput.guestConversationId

  let conversation: ConversationModel | null | undefined = null
  let contact: ContactModel | null | undefined = null

  let contactInbox = await tx.query.contactInboxModel.findFirst({
    where: {
      inboxId: integrationWebchat.inboxId,
      sourceId,
    },
    orderBy: {
      lastMessageAt: "desc",
    },
  })
  if (contactInbox) {
    conversation = await tx.query.conversationModel.findFirst({
      where: {
        workspaceId: parsedInput.workspaceId,
        contactId: contactInbox.contactId,
      },
    })
    contact = await tx.query.contactModel.findFirst({
      where: {
        id: contactInbox.contactId,
      },
    })
  } else {
    // Create new contact
    contact = await tx
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
      .then((result) => result[0])
    if (!contact) {
      throw new ChatbotXException("Contact not found")
    }

    isNewContact = true

    contactInbox = await tx
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
      .then((result) => result[0])
    if (!contactInbox) {
      throw new ChatbotXException("Contact inbox not found")
    }

    conversation = await tx
      .insert(conversationModel)
      .values({
        id: createId(),
        workspaceId: parsedInput.workspaceId,
        contactId: contact.id,
      })
      .returning()
      .then((result) => result[0])
  }

  if (!conversation) {
    throw new ChatbotXException("Conversation not found")
  }
  if (!contactInbox) {
    throw new ChatbotXException("Contact inbox not found")
  }
  if (!contact) {
    throw new ChatbotXException("Contact not found")
  }

  return {
    conversation,
    contact,
    contactInbox,
    isNewContact,
  }
}
