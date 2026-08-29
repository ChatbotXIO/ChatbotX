"use server"

import {
  contactInboxService,
  conversationService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import { conversationModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
  UserModel,
} from "@chatbotx.io/database/types"
import {
  guessFileTypeFromMimeType,
  pathJoin,
  type UploadedFile,
  uploader,
  uploadMultipleFiles,
} from "@chatbotx.io/filesystem"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import {
  findMediaLibraryFileById,
  findMediaLibraryFileByPath,
} from "@/features/media-library/queries/files"
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

/**
 * Copies a Media Library file into a conversation-scoped path instead of
 * reusing the Media Library file's own S3 key: attachments must outlive the
 * Media Library file they were picked from, since deleting that file (or its
 * folder) later must not break an already-sent message.
 */
type CopyableMediaLibraryFile = {
  path: string
  name: string
  mimeType: string
  size: number
}

const copyMediaLibraryFileToConversationAttachment = async (props: {
  mediaLibraryFile: CopyableMediaLibraryFile
  workspaceId: string
  conversationId: string
}): Promise<UploadedFile> => {
  const { mediaLibraryFile, workspaceId, conversationId } = props

  const attachmentPath = pathJoin(
    `public/space/${workspaceId}/conversations/${conversationId}`,
    createId(),
  )
  await uploader.copyObject(mediaLibraryFile.path, attachmentPath)

  return {
    name: mediaLibraryFile.name,
    mimeType: mediaLibraryFile.mimeType,
    originPath: attachmentPath,
    size: mediaLibraryFile.size,
    fileType: guessFileTypeFromMimeType(mediaLibraryFile.mimeType),
  }
}

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

  // A private reply is a DM to the commenter, not a reply within the
  // post/comment thread — Meta delivers it to the contact's inbox, not the
  // post. Route the outgoing message row (and its conversation-scoped side
  // effects below) to the contact's DM conversation instead of whichever
  // conversation is currently open, creating it if this is their first DM.
  const targetConversation = parsedInput.isPrivateReply
    ? await conversationService.findOrCreate({
        workspaceId: conversation.workspaceId,
        contactId: contactInbox.contactId,
        sourceId: null,
      })
    : conversation

  let uploadedFiles: UploadedFile[] = []
  if ("files" in parsedInput && parsedInput.files.length > 0) {
    uploadedFiles = await uploadMultipleFiles(
      parsedInput.files,
      `public/space/${conversation.workspaceId}/conversations/${targetConversation.id}`,
    )
  } else if ("mediaFile" in parsedInput && parsedInput.mediaFile) {
    // Legacy path-based selection, still used by public oRPC APIs.
    const mediaLibraryFile = await findMediaLibraryFileByPath({
      workspaceId: conversation.workspaceId,
      path: parsedInput.mediaFile.path,
    })
    if (!mediaLibraryFile) {
      throw new ChatbotXException("Media library file not found")
    }

    uploadedFiles = [
      await copyMediaLibraryFileToConversationAttachment({
        mediaLibraryFile,
        workspaceId: conversation.workspaceId,
        conversationId: targetConversation.id,
      }),
    ]
  } else if ("mediaFileId" in parsedInput && parsedInput.mediaFileId) {
    const mediaLibraryFile = await findMediaLibraryFileById({
      workspaceId: conversation.workspaceId,
      id: parsedInput.mediaFileId,
    })
    if (!mediaLibraryFile) {
      throw new ChatbotXException("Media library file not found")
    }

    uploadedFiles = [
      await copyMediaLibraryFileToConversationAttachment({
        mediaLibraryFile,
        workspaceId: conversation.workspaceId,
        conversationId: targetConversation.id,
      }),
    ]
  }

  const repository = await createMessageRepository()

  const parentId = parsedInput.replyToMessageId ?? null

  const now = new Date()
  const messageInput = {
    text: "text" in parsedInput ? parsedInput.text : null,
    messageType: "outgoing" as const,
    workspaceId: conversation.workspaceId,
    conversationId: targetConversation.id,
    senderType: user ? ("user" as const) : ("api" as const),
    senderId: user?.id ?? null,
    contactInboxId: contactInbox.id,
    contentType: "text" as const,
    createdAt: now,
    type: parsedInput.replyToMessageId
      ? ("comment" as const)
      : ("message" as const),
    parentId,
    contentAttributes: parsedInput.isPrivateReply
      ? { isPrivateReply: true }
      : null,
  }

  const attachmentInputs = uploadedFiles.map((file) => ({
    workspaceId: conversation.workspaceId,
    conversationId: targetConversation.id,
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
    .where(eq(conversationModel.id, targetConversation.id))

  await contactInboxService.updateTracking({
    contactInboxId: contactInbox.id,
    contactId: contactInbox.contactId,
    workspaceId: conversation.workspaceId,
    data: {
      firstInteractionAt: message.createdAt,
      lastMessageAt: message.createdAt,
    },
  })

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
        conversation: targetConversation,
        contactInbox,
        message: {
          ...messageWithAttachments,
          clientId: parsedInput.clientId,
          parentCreatedAt: parsedInput.replyToMessageCreatedAt ?? null,
        },
        sendFrom: "inbox",
      },
    }),
    ...(user && messageInput.text
      ? [
          chatQueue.add(ChatJobAction.checkOutboundAutomatedResponse, {
            type: ChatJobAction.checkOutboundAutomatedResponse,
            data: {
              conversation: targetConversation,
              contactInbox,
              message: { id: message.id, text: messageInput.text },
            },
          }),
        ]
      : []),
  ]

  await Promise.allSettled(promises)

  return messageWithAttachments
}
