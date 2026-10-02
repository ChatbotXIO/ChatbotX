"use server"

import {
  contactInboxService,
  conversationService,
  messageService,
  queueWorkspaceRealtimeEvent,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getImageDimensions, uploader } from "@chatbotx.io/filesystem"
import { RealtimeEventType } from "@chatbotx.io/realtime-protocol"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { workspaceActionClient } from "@/lib/safe-action"
import { type EditMessageRequest, editMessageRequest } from "../schema/mutation"

export const editMessage = async (props: {
  workspaceId: string
  conversationId: string
  parsedInput: EditMessageRequest
}) => {
  const { workspaceId, conversationId, parsedInput } = props
  const {
    messageId,
    createdAt,
    newText,
    newAttachmentPath,
    newAttachmentPublicUrl,
    newAttachmentMimeType,
    newAttachmentName,
    newAttachmentSize,
    removeAttachment,
  } = parsedInput

  const conversation = await conversationService.findByOrFail({
    where: { id: conversationId, workspaceId },
  })

  const message = await messageService.findWithAttachments({
    id: messageId,
    createdAt,
    workspaceId,
  })

  if (!message || message.conversationId !== conversationId) {
    throw new ChatbotXException("Comment not found")
  }

  if (message.messageType !== "outgoing" || message.type !== "comment") {
    throw new ChatbotXException("Message is not an editable comment")
  }

  const contactInbox = await contactInboxService.findBy({
    where: { id: message.contactInboxId },
  })
  if (!contactInbox) {
    throw new ChatbotXException("Inbox not found")
  }
  await messageService.updateText({
    id: messageId,
    workspaceId,
    text: newText,
    createdAt: message.createdAt,
  })

  const attachments: Parameters<
    typeof messageService.replaceAttachments
  >[0]["attachments"] = []
  let resolvedWidth = 0
  let resolvedHeight = 0

  if (newAttachmentPath) {
    const mimeType = newAttachmentMimeType ?? "application/octet-stream"
    let fileType: "image" | "video" | "audio" | "file" = "file"
    let width = 0
    let height = 0
    if (mimeType.startsWith("image/")) {
      fileType = "image"
      try {
        const buffer = await uploader.getObject(newAttachmentPath)
        const dims = await getImageDimensions(mimeType, buffer)
        width = dims.width ?? 0
        height = dims.height ?? 0
      } catch {
        // dimensions unavailable, keep defaults
      }
    } else if (mimeType.startsWith("video/")) {
      fileType = "video"
    } else if (mimeType.startsWith("audio/")) {
      fileType = "audio"
    }

    resolvedWidth = width
    resolvedHeight = height

    attachments.push({
      id: createId(),
      workspaceId,
      conversationId,
      fileType,
      mimeType,
      originPath: newAttachmentPath,
      name: newAttachmentName ?? null,
      size: newAttachmentSize,
      height,
      width,
    })
  }

  if (removeAttachment || newAttachmentPath) {
    await messageService.replaceAttachments({
      id: messageId,
      workspaceId,
      createdAt: message.createdAt,
      attachments,
    })
  }

  queueWorkspaceRealtimeEvent(workspaceId, {
    eventType: RealtimeEventType.messageUpdated,
    data: {
      messageId,
      newText,
      newAttachmentPath: newAttachmentPath ?? null,
      newAttachmentPublicUrl: newAttachmentPublicUrl ?? null,
      newAttachmentMimeType: newAttachmentMimeType ?? null,
      newAttachmentWidth: resolvedWidth,
      newAttachmentHeight: resolvedHeight,
      removedAttachment: removeAttachment ?? false,
    },
  })

  await Promise.allSettled([
    chatQueue.add(ChatJobAction.editChannelMessage, {
      type: ChatJobAction.editChannelMessage,
      data: {
        conversation,
        contactInbox,
        message: { id: messageId, createdAt: message.createdAt },
        newText,
        newAttachmentUrl: newAttachmentPublicUrl,
      },
    }),
  ])

  return {
    success: true,
    messageId,
    newText,
    newAttachmentPath: newAttachmentPath ?? null,
    newAttachmentPublicUrl: newAttachmentPublicUrl ?? null,
    newAttachmentMimeType: newAttachmentMimeType ?? null,
    newAttachmentWidth: resolvedWidth,
    newAttachmentHeight: resolvedHeight,
    removedAttachment: removeAttachment ?? false,
  }
}

export const editMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(editMessageRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
    } = props

    return await editMessage({ workspaceId, conversationId, parsedInput })
  })
