"use server"

import { resolveTenantSettings } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
  UserModel,
} from "@chatbotx.io/database/types"
import { type UploadedFile, uploadMultipleFiles } from "@chatbotx.io/filesystem"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
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

  if ("flowId" in parsedInput) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: parsedInput.flowId,
        nodeId: parsedInput.nodeId,
        sendFrom: "inbox",
      },
    })
    return null
  }

  const { storageUrl } = await resolveTenantSettings({
    workspaceId: conversation.workspaceId,
  })

  let uploadedFiles: UploadedFile[] = []
  if ("files" in parsedInput && parsedInput.files.length > 0) {
    uploadedFiles = await uploadMultipleFiles(
      parsedInput.files,
      `public/space/${conversation.workspaceId}/conversations/${conversation.id}`,
    )
  }

  const repository = await createMessageRepository()

  const now = new Date()
  const messageInput = {
    text: "text" in parsedInput ? parsedInput.text : null,
    messageType: "outgoing" as const,
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    senderType: user ? ("user" as const) : ("api" as const),
    senderId: user?.id ?? null,
    contactInboxId: contactInbox.id,
    contentType: "text" as const,
    createdAt: now,
  }

  const attachmentInputs = uploadedFiles.map((file) => ({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    ...file,
  }))

  const message =
    attachmentInputs.length > 0
      ? await repository.createWithAttachments(messageInput, attachmentInputs)
      : await repository.create(messageInput)

  await db
    .update(conversationModel)
    .set({
      agentLastReadAt: now,
      lastActivityAt: now,
      adminRepliedAt: now,
    })
    .where(eq(conversationModel.id, conversation.id))

  await db
    .update(contactInboxModel)
    .set({ lastMessageAt: message.createdAt })
    .where(eq(contactInboxModel.id, contactInbox.id))

  const attachments =
    "attachments" in message && Array.isArray(message.attachments)
      ? message.attachments
      : []
  const messageWithAttachments = {
    ...message,
    attachments: attachments.map((attachment) => ({
      ...attachment,
      url: getPublicFileUrl(attachment.originPath, storageUrl),
    })),
  }

  const promises: Promise<unknown>[] = [
    chatQueue.add(ChatJobAction.broadcastEvent, {
      type: ChatJobAction.broadcastEvent,
      data: {
        workspaceId: messageWithAttachments.workspaceId,
        event: {
          eventType: RealtimeEventType.messageCreated,
          data: {
            ...messageWithAttachments,
            clientId: parsedInput.clientId,
          },
        },
      },
    }),
    chatQueue.add(ChatJobAction.sendChannelMessage, {
      type: ChatJobAction.sendChannelMessage,
      data: {
        conversation,
        contactInbox,
        message: {
          ...messageWithAttachments,
          clientId: parsedInput.clientId,
        },
        sendFrom: "inbox",
      },
    }),
  ]

  await Promise.allSettled(promises)

  return messageWithAttachments
}
