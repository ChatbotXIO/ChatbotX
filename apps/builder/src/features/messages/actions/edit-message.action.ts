"use server"

import { contactInboxService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { findOrFail } from "@chatbotx.io/database/client"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import { conversationModel } from "@chatbotx.io/database/schema"
import { getImageDimensions, uploader } from "@chatbotx.io/filesystem"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { workspaceActionClient } from "@/lib/safe-action"
import { editMessageRequest } from "../schema/mutation"

export const editMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(editMessageRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
    } = props
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

    const conversation = await findOrFail({
      table: conversationModel,
      where: {
        id: conversationId,
        workspaceId,
      },
      message: "Conversation not found",
    })

    const repository = await createMessageRepository()

    const message = await repository.findById(messageId, createdAt)

    if (!message) {
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
    await repository.updateMessageText(
      messageId,
      workspaceId,
      newText,
      message.createdAt,
    )

    if (removeAttachment || newAttachmentPath) {
      await repository.deleteAttachmentsByMessageId(
        messageId,
        workspaceId,
        message.createdAt,
      )
    }

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

      await repository.bulkCreateAttachments([
        {
          id: createId(),
          workspaceId,
          conversationId,
          messageId,
          messageCreatedAt: message.createdAt,
          fileType,
          mimeType,
          originPath: newAttachmentPath,
          name: newAttachmentName ?? null,
          size: newAttachmentSize,
          height,
          width,
        },
      ])
    }

    await Promise.allSettled([
      chatQueue.add(ChatJobAction.broadcastEvent, {
        type: ChatJobAction.broadcastEvent,
        data: {
          workspaceId,
          event: {
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
          },
        },
      }),
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
  })
