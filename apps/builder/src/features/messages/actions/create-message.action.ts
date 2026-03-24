"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import {
  attachmentModel,
  contactModel,
  conversationModel,
  messageModel,
} from "@aha.chat/database/schema"
import {
  type ContactModel,
  type ConversationModel,
  type UserModel,
  WEBCHAT_SOURCE_PREFIX,
} from "@aha.chat/database/types"
import { getPublicUrl } from "@aha.chat/database/utils"
import { type UploadedFile, uploadMultipleFiles } from "@aha.chat/filesystem"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { OutgoingConversation, OutgoingMessage } from "@aha.chat/sdk"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@aha.chat/worker-config"
import { contactTrackingService } from "@chatbotx.io/analytics"
import { createId } from "@paralleldrive/cuid2"
import type { AttachmentResource } from "@/features/attachments/schemas"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
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
      const conversation = await findOrFail<ConversationModel>(
        conversationModel,
        {
          id: conversationId,
          chatbotId,
        },
      )

      return createMessage({
        conversation,
        parsedInput,
        user: ctx.user,
      })
    },
  )

export const createMessage = async (props: {
  conversation: ConversationModel
  parsedInput: CreateMessageRequest
  user?: UserModel
}) => {
  const { conversation, parsedInput, user } = props

  // Handle send flow
  if ("flowId" in parsedInput) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        flowId: parsedInput.flowId,
        nodeId: parsedInput.nodeId,
      },
    })
    return null
  }

  // Upload file if exists
  let uploadedFiles: UploadedFile[] = []
  if ("files" in parsedInput && parsedInput.files.length > 0) {
    uploadedFiles = await uploadMultipleFiles(
      parsedInput.files,
      `public/chatbots/${conversation.chatbotId}/conversations/${conversation.id}`,
    )
  }
  // else if ("fileUrl" in parsedInput) {
  //   const uploadedFile = await uploadFileFromUrl(
  //     parsedInput.fileUrl,
  //     `public/chatbots/${conversation.chatbotId}/conversations/${conversation.id}`,
  //   )
  //   uploadedFiles = [uploadedFile]
  // }

  const message = await db.transaction(async (tx) => {
    const newMessage: MessageResource = await tx
      .insert(messageModel)
      .values({
        id: createId(),
        content: "content" in parsedInput ? parsedInput.content : null,
        messageType: "outgoing",
        chatbotId: conversation.chatbotId,
        conversationId: conversation.id,
        senderType: user ? "user" : "api",
        senderId: user?.id,
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
        .then((result) =>
          result.map((attachment) => ({
            ...attachment,
            url: getPublicUrl(attachment.originPath),
          })),
        )

      newMessage.attachments = attachments as AttachmentResource[]
    }

    await tx
      .update(conversationModel)
      .set({
        agentLastReadAt: new Date(),
        lastActivityAt: new Date(),
        adminRepliedAt: new Date(),
      })
      .where(eq(conversationModel.id, conversation.id))

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

  const contact = await findOrFail<ContactModel>(
    contactModel,
    {
      where: {
        id: conversation.contactId,
      },
    },
    "Contact not found",
  )

  if (contact.sourceId) {
    promises.push(
      contactTrackingService.trackEvent({
        chatbotId: message.chatbotId,
        contactId: contact.sourceId,
        eventType: "contact_message_out",
        occurredAt: new Date(),
        source: contact.source,
        sourceId: contact.sourceId,
        channel: conversation.channel,
        country: undefined,
        metadata: {
          messageId: message.id,
          conversationId: message.conversationId,
        },
      }),
    )
  }

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

  if (contact.sourceId) {
    promises.push(
      contactTrackingService.trackEvent({
        chatbotId: message.chatbotId,
        contactId: contact.sourceId,
        eventType: "contact_message_out",
        senderType: "human",
        occurredAt: new Date(),
        source: contact.source,
        sourceId: contact.sourceId,
        channel: conversation.channel,
        country: undefined,
        metadata: {
          messageId: message.id,
          conversationId: message.conversationId,
          adminId: user?.id ?? "",
        },
      }),
    )
  }

  // Broadcast and send
  await Promise.all(promises)

  revalidateCacheTags(`chatbots:${conversation.chatbotId}:conversations`)

  return message
}
