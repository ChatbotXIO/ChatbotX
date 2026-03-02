"use server"

import { db, eq, findOrFail, type Transaction } from "@aha.chat/database/client"
import {
  attachmentModel,
  chatbotUsageModel,
  contactModel,
  conversationModel,
  integrationWebchatModel,
  messageModel,
} from "@aha.chat/database/schema"
import type {
  ChatbotUsageModel,
  ConversationAttributes,
  IntegrationWebchatModel,
} from "@aha.chat/database/types"
import { type UploadedFile, uploadMultipleFiles } from "@aha.chat/filesystem"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { OutgoingMessage } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { randomString } from "remeda"
import type { AttachmentResource } from "@/features/attachments/schemas"
import { BaseException } from "@/lib/errors/exception"
import { actionClient } from "@/lib/safe-action"
import type { MessageResource } from "../schemas"
import {
  type CreateWebchatMessageRequest,
  createWebchatMessageRequest,
} from "../schemas/create-message.schema"

export const createWebchatMessageAction = actionClient
  .inputSchema(createWebchatMessageRequest)
  .action(handleCreateWebchatMessage)

export async function handleCreateWebchatMessage({
  parsedInput,
}: {
  parsedInput: CreateWebchatMessageRequest
}) {
  const { conversation } = await db.transaction(async (tx) => {
    return await getConversationFromInput(tx, parsedInput)
  })

  // Process flow if exists
  if ("flowId" in parsedInput) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
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
        conversationId: conversation.id,
        ref: parsedInput.initRef,
      },
    })
    return null
  }

  if ("postback" in parsedInput && parsedInput.postback) {
    await integrationQueue.add(IntegrationJobAction.runFlowPostback, {
      type: IntegrationJobAction.runFlowPostback,
      data: {
        conversationId: conversation.id,
        action: parsedInput.postback,
      },
    })
  }

  // Create conversation if it does not exist
  return await db.transaction(async (tx) => {
    // upload file if exists
    let uploadedFiles: UploadedFile[] = []
    if ("files" in parsedInput && parsedInput.files.length > 0) {
      uploadedFiles = await uploadMultipleFiles(
        parsedInput.files,
        `public/chatbots/${parsedInput.chatbotId}/conversations/${conversation.id}`,
      )
    }

    if (
      "content" in parsedInput &&
      (parsedInput.content || uploadedFiles.length > 0)
    ) {
      const newMessage: MessageResource = await tx
        .insert(messageModel)
        .values({
          id: createId(),
          content: "content" in parsedInput ? parsedInput.content : null,
          messageType: "incoming",
          chatbotId: conversation.chatbotId,
          conversationId: conversation.id,
          senderType: "contact",
          senderId: conversation.contactId,
          inboxId: conversation.inboxId,
          contentType: "text",
        })
        .returning()
        .then((result) => result[0])

      if (uploadedFiles.length > 0) {
        const attachments = await tx
          .insert(attachmentModel)
          .values(
            uploadedFiles.map((file) => ({
              id: createId(),
              messageId: newMessage.id,
              chatbotId: newMessage.chatbotId,
              conversationId: newMessage.conversationId,
              ...file,
            })),
          )
          .returning()

        newMessage.attachments = attachments as AttachmentResource[]
      }

      await tx
        .update(conversationModel)
        .set({
          contactLastSeenAt: new Date(),
          lastActivityAt: new Date(),
          contactRepliedAt: new Date(),
        })
        .where(eq(conversationModel.id, conversation.id))

      // Broadcast realtime message
      const promises: Promise<unknown>[] = []
      promises.push(
        broadcastToChatbotParty(newMessage.chatbotId, {
          eventType: RealtimeEventType.messageCreated,
          data: {
            ...newMessage,
            clientId: parsedInput.clientId,
          },
        }),
      )

      if (uploadedFiles.length > 0 && conversation.sourceId) {
        promises.push(
          broadcastToGuestParty(conversation.sourceId, {
            eventType: RealtimeEventType.messageCreated,
            data: {
              ...newMessage,
              clientId: parsedInput.clientId,
            },
          }),
        )
      }

      const conversationAttributes =
        conversation.conversationAttributes as unknown as ConversationAttributes

      if (conversationAttributes?.challenge) {
        promises.push(
          integrationQueue.add(
            IntegrationJobAction.runChallenge,
            {
              type: IntegrationJobAction.runChallenge,
              data: {
                conversationId: conversation.id,
                challenge: conversationAttributes?.challenge,
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
        !conversation.liveChatEnabled &&
        newMessage.content &&
        !("postback" in parsedInput && parsedInput.postback)
      ) {
        // trigger automated response if the message is not a postback
        promises.push(
          integrationQueue.add(IntegrationJobAction.triggerAutomatedResponse, {
            type: IntegrationJobAction.triggerAutomatedResponse,
            data: {
              message: newMessage as OutgoingMessage,
              conversation,
            },
          }),
        )
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }

      return newMessage
    }

    return null
  })
}

async function getConversationFromInput(
  tx: Transaction,
  parsedInput: CreateWebchatMessageRequest,
) {
  const integrationWebchat = await findOrFail<IntegrationWebchatModel>(
    integrationWebchatModel,
    {
      chatbotId: parsedInput.chatbotId,
      id: parsedInput.webchatId,
    },
    "Channel not found",
  )

  const sourceId = parsedInput.guestConversationId
  let conversation = await tx.query.conversationModel.findFirst({
    where: {
      chatbotId: parsedInput.chatbotId,
      sourceId,
      inboxId: integrationWebchat.inboxId,
    },
  })

  if (!conversation) {
    // find or create contact
    let contact = await tx.query.contactModel.findFirst({
      where: {
        chatbotId: parsedInput.chatbotId,
        sourceId,
      },
    })

    if (!contact) {
      const chatbotUsage = await findOrFail<ChatbotUsageModel>(
        chatbotUsageModel,
        {
          chatbotId: parsedInput.chatbotId,
        },
        "Chatbot usage not found",
      )
      if (chatbotUsage.contactsCount >= chatbotUsage.maxContacts) {
        throw new BaseException("Max contacts reached")
      }

      contact = await tx
        .insert(contactModel)
        .values({
          id: createId(),
          chatbotId: parsedInput.chatbotId,
          sourceId,
          email: parsedInput.guestConversationId,
          source: "webchat",
          gender: "unknown",
          firstName: "Guest",
          lastName: randomString(10),
        })
        .returning()
        .then((result) => result[0])
    }

    if (!contact) {
      throw new BaseException("Contact not found")
    }

    conversation = await tx
      .insert(conversationModel)
      .values({
        id: createId(),
        chatbotId: parsedInput.chatbotId,
        sourceId,
        inboxId: integrationWebchat.inboxId,
        contactId: contact.id,
      })
      .returning()
      .then((result) => result[0])
  }

  if (!conversation) {
    throw new BaseException("Conversation not found")
  }

  return { conversation }
}
