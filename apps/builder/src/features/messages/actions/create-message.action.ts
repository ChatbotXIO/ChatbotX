"use server"

import { db, eq } from "@aha.chat/database/client"
import {
  attachmentModel,
  conversationModel,
  messageModel,
} from "@aha.chat/database/schema"
import { type UserModel, WEBCHAT_SOURCE_PREFIX } from "@aha.chat/database/types"
import { type UploadedFile, uploadMultipleFiles } from "@aha.chat/filesystem"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { OutgoingConversation, OutgoingMessage } from "@aha.chat/sdk"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import type { AttachmentResource } from "@/features/attachments/schemas"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { findConversation } from "@/features/conversations/queries/list-conversations.query"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import type { MessageResource } from "../schemas"
import {
  type CreateMessageRequest,
  createMessageRequest,
} from "../schemas/create-message.schema"

export const createMessageAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(createMessageRequest)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, conversationId],
      parsedInput,
    }: {
      ctx: { user: UserModel }
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: CreateMessageRequest
    }) => {
      const { data: conversation } = await findConversation({
        id: conversationId,
        chatbotId,
      })

      // upload file if exists
      let uploadedFiles: UploadedFile[] = []
      if ("files" in parsedInput && parsedInput.files.length > 0) {
        uploadedFiles = await uploadMultipleFiles(
          parsedInput.files,
          `public/chatbots/${chatbotId}/conversations/${conversation.id}`,
        )
      }

      const message = await db.transaction(async (tx) => {
        const newMessage: MessageResource = await tx
          .insert(messageModel)
          .values({
            id: createId(),
            content: "content" in parsedInput ? parsedInput.content : null,
            messageType: "outgoing",
            chatbotId: conversation.chatbotId,
            conversationId,
            senderType: "user",
            senderId: ctx.user.id,
            inboxId: conversation.inboxId,
            contentType: "text",
          })
          .returning()
          .then((result) => result[0])

        // create attachment if path exists
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
            agentLastSeenAt: new Date(),
            lastActivityAt: new Date(),
            adminRepliedAt: new Date(),
          })
          .where(eq(conversationModel.id, conversationId))

        return newMessage
      })

      const promises: Promise<unknown>[] = [
        broadcastToChatbotParty(message.chatbotId, {
          eventType: RealtimeEventType.messageCreated,
          data: {
            ...message,
            clientId: parsedInput.clientId,
          },
        }),
      ]
      if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
        promises.push(
          broadcastToGuestParty(conversation.sourceId, {
            eventType: RealtimeEventType.messageCreated,
            data: {
              ...message,
              clientId: parsedInput.clientId,
            },
          }),
        )
      } else {
        promises.push(
          chatQueue.add(ChatJobAction.sendExternalMessage, {
            type: ChatJobAction.sendExternalMessage,
            data: {
              conversation: conversation as OutgoingConversation,
              message: {
                ...message,
                clientId: parsedInput.clientId,
              } as OutgoingMessage,
            },
          }),
        )
      }

      // Broadcast and send
      await Promise.all(promises)

      revalidateCacheTags(`chatbots:${chatbotId}:conversations`)
    },
  )

// export const sendTextMessage = async ({
//   chatbotId,
//   contactId,
//   channel,
//   text,
// }: {
//   chatbotId: string
//   contactId: string
//   channel: InboxType
//   text: string
// }) => {
//   const conversation = await findConversationByContact({
//     chatbotId,
//     contactId,
//     inboxType: channel,
//   })

//   if (!conversation) {
//     throw new Error("Conversation not found")
//   }

//   const conversationId = conversation.id

//   const message = await db.transaction(async (tx) => {
//     const newMessage: MessageResource = await tx
//       .insert(messageModel)
//       .values({
//         id: createId(),
//         content: text,
//         messageType: "outgoing",
//         chatbotId: conversation.chatbotId,
//         conversationId,
//         senderType: "api",
//         senderId: null,
//         inboxId: conversation.inboxId,
//         contentType: "text",
//       })
//       .returning()
//       .then((result) => result[0])

//     await tx
//       .update(conversationModel)
//       .set({
//         agentLastSeenAt: new Date(),
//         lastActivityAt: new Date(),
//         adminRepliedAt: new Date(),
//       })
//       .where(eq(conversationModel.id, conversationId))

//     return newMessage
//   })

//   const promises: Promise<unknown>[] = [
//     broadcastToChatbotParty(chatbotId, {
//       eventType: RealtimeEventType.messageCreated,
//       data: message,
//     }),
//   ]
//   if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
//     promises.push(
//       broadcastToGuestParty(conversation.sourceId, {
//         eventType: RealtimeEventType.messageCreated,
//         data: message,
//       }),
//     )
//   } else {
//     promises.push(
//       chatQueue.add(ChatJobAction.sendExternalMessage, {
//         type: ChatJobAction.sendExternalMessage,
//         data: {
//           conversation: conversation as OutgoingConversation,
//           message: message as OutgoingMessage,
//         },
//       }),
//     )
//   }

//   // Broadcast and send
//   await Promise.all(promises)

//   revalidateCacheTags(`chatbots:${chatbotId}:conversations`)
// }

// export const sendFileMessage = async ({
//   chatbotId,
//   contactId,
//   channel,
//   file,
// }: {
//   chatbotId: string
//   contactId: string
//   channel: InboxType
//   file: File
// }) => {
//   const conversation = await findConversationByContact({
//     chatbotId,
//     contactId,
//     inboxType: channel,
//   })

//   if (!conversation) {
//     throw new Error("Conversation not found")
//   }

//   const conversationId = conversation.id

//   // upload file
//   const uploadedFiles = await uploadMultipleFiles(
//     [file],
//     `public/chatbots/${chatbotId}/conversations/${conversation.id}`,
//   )

//   const message = await db.transaction(async (tx) => {
//     const newMessage: MessageResource = await tx
//       .insert(messageModel)
//       .values({
//         id: createId(),
//         content: null,
//         messageType: "outgoing",
//         chatbotId: conversation.chatbotId,
//         conversationId,
//         senderType: "api",
//         senderId: null,
//         inboxId: conversation.inboxId,
//         contentType: "text",
//       })
//       .returning()
//       .then((result) => result[0])

//     // create attachment
//     const attachments = await tx
//       .insert(attachmentModel)
//       .values(
//         uploadedFiles.map((file) => ({
//           id: createId(),
//           messageId: newMessage.id,
//           chatbotId: newMessage.chatbotId,
//           conversationId: newMessage.conversationId,
//           ...file,
//         })),
//       )
//       .returning()

//     newMessage.attachments = attachments as AttachmentResource[]

//     await tx
//       .update(conversationModel)
//       .set({
//         agentLastSeenAt: new Date(),
//         lastActivityAt: new Date(),
//         adminRepliedAt: new Date(),
//       })
//       .where(eq(conversationModel.id, conversationId))

//     return newMessage
//   })

//   const promises: Promise<unknown>[] = [
//     broadcastToChatbotParty(chatbotId, {
//       eventType: RealtimeEventType.messageCreated,
//       data: message,
//     }),
//   ]
//   if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
//     promises.push(
//       broadcastToGuestParty(conversation.sourceId, {
//         eventType: RealtimeEventType.messageCreated,
//         data: message,
//       }),
//     )
//   } else {
//     promises.push(
//       chatQueue.add(ChatJobAction.sendExternalMessage, {
//         type: ChatJobAction.sendExternalMessage,
//         data: {
//           conversation: conversation as OutgoingConversation,
//           message: message as OutgoingMessage,
//         },
//       }),
//     )
//   }

//   // Broadcast and send
//   await Promise.all(promises)

//   revalidateCacheTags(`chatbots:${chatbotId}:conversations`)
// }

// export const sendFlowMessage = async ({
//   chatbotId,
//   contactId,
//   channel,
//   flowId,
// }: {
//   chatbotId: string
//   contactId: string
//   channel: InboxType
//   flowId: string
// }) => {
//   const conversation = await findConversationByContact({
//     chatbotId,
//     contactId,
//     inboxType: channel,
//   })

//   if (!conversation) {
//     throw new Error("Conversation not found")
//   }

//   const flowVersion = await db.query.flowVersionModel.findFirst({
//     where: {
//       flowId,
//       isDraft: false,
//     },
//   })

//   if (!flowVersion) {
//     throw new Error("Flow version not found")
//   }

//   await integrationQueue.add(IntegrationJobAction.sendFlow, {
//     type: IntegrationJobAction.sendFlow,
//     data: {
//       conversationId: conversation.id,
//       flowId,
//     },
//   })
// }
