"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  attachmentModel,
  conversationModel,
  messageModel,
} from "@chatbotx.io/database/schema"
import type {
  AttachmentModel,
  ContactInboxModel,
  ConversationModel,
  MessageModel,
  UserModel,
} from "@chatbotx.io/database/types"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import { type UploadedFile, uploadMultipleFiles } from "@chatbotx.io/filesystem"
import {
  broadcastToGuestParty,
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateMessageRequest,
  createMessageRequest,
} from "../schema/mutation"

export const createMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createMessageRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
      ctx,
    } = props

    const conversation = await findOrFail({
      table: conversationModel,
      where: {
        id: conversationId,
        workspaceId,
      },
      message: "Conversation not found",
    })

    // Find target contact inbox, or fallback to latest interactive contactInbox
    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: {
        contactId: conversation.contactId,
        inboxId: parsedInput.inboxId ? parsedInput.inboxId : undefined,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    })
    if (!contactInbox) {
      throw new ChatbotXException("Inbox not found")
    }

    return createMessage({
      conversation,
      contactInbox,
      parsedInput,
      user: ctx.user,
    })
  })

export const createMessage = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  parsedInput: CreateMessageRequest
  user?: UserModel
}) => {
  const { conversation, parsedInput, user, contactInbox } = props

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
      `public/space/${conversation.workspaceId}/conversations/${conversation.id}`,
    )
  }
  // else if ("fileUrl" in parsedInput) {
  //   const uploadedFile = await uploadFileFromUrl(
  //     parsedInput.fileUrl,
  //     `public/space/${conversation.workspaceId}/conversations/${conversation.id}`,
  //   )
  //   uploadedFiles = [uploadedFile]
  // }

  const message = await db.transaction(async (tx) => {
    const newMessage: MessageModel & { attachments?: AttachmentModel[] } =
      await tx
        .insert(messageModel)
        .values({
          text: "text" in parsedInput ? parsedInput.text : null,
          messageType: "outgoing",
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          senderType: user ? "user" : "api",
          senderId: user?.id,
          contactInboxId: contactInbox.id,
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
            workspaceId: newMessage.workspaceId,
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

      newMessage.attachments = attachments
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
    broadcastToWorkspaceParty(message.workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: {
        ...message,
        clientId: parsedInput.clientId,
      },
    }),
  ]

  if (contactInbox.channel === channelTypes.enum.webchat) {
    promises.push(
      broadcastToGuestParty(contactInbox.sourceId, {
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
          conversation,
          contactInbox,
          message: {
            ...message,
            clientId: parsedInput.clientId,
          },
        },
      }),
    )
  }

  // promises.push(
  //   contactTrackingService.trackEvent({
  //     workspaceId: message.workspaceId,
  //     contactId: contactInbox.contactId,
  //     eventType: "contact_message_out",
  //     senderType: "human",
  //     adminId: user?.id,
  //     occurredAt: new Date(),
  //     source: contactInbox.source,
  //     sourceId: contactInbox.sourceId,
  //     channel: contactInbox.channel,
  //     country: undefined,
  //     metadata: {
  //       messageId: message.id,
  //       conversationId: message.conversationId,
  //     },
  //   }),
  // )

  // Broadcast and send
  await Promise.all(promises)

  revalidateCacheTags(`workspaces:${conversation.workspaceId}:conversations`)

  return message
}
