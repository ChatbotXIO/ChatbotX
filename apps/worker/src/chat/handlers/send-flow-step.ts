import type { Prisma } from "@aha.chat/database"
import {
  ContentType,
  MessageType,
  prisma,
  SenderType,
} from "@aha.chat/database"
import { WEBCHAT_SOURCE_PREFIX } from "@aha.chat/database/types"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { ConversationEntity } from "@aha.chat/sdk"
import type { ChatJobSendFlowStep } from "@aha.chat/worker-config"
import { sendFlowStepToExternal } from "./send-message"

export async function sendFlowStep({
  conversationId,
  flowVersionId,
  step,
}: ChatJobSendFlowStep["data"]) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId },
    include: { contact: true },
  })
  if (!conversation) {
    return
  }

  // Type guards to avoid `any`
  type ImageAttachment = {
    originPath: string
    name: string
    mimeType: string
    size?: number
    width?: number
    height?: number
    fileType?: string
  }

  function isSendImageStepWithAttachment(
    s: unknown,
  ): s is { stepType: "SEND_IMAGE"; attachment: ImageAttachment } {
    if (
      typeof s !== "object" ||
      s === null ||
      !("stepType" in s) ||
      (s as { stepType?: unknown }).stepType !== "SEND_IMAGE"
    ) {
      return false
    }
    const att = (s as { attachment?: unknown }).attachment as
      | ImageAttachment
      | undefined
    return (
      !!att &&
      typeof att === "object" &&
      typeof att.originPath === "string" &&
      typeof att.name === "string" &&
      typeof att.mimeType === "string"
    )
  }

  // Create message with attachment if SEND_IMAGE
  type MessageWithAttachments = Prisma.MessageGetPayload<{
    include: { attachments: true }
  }>
  const message: MessageWithAttachments = await prisma.message.create({
    data: {
      inboxId: conversation.inboxId,
      chatbotId: conversation.chatbotId,
      conversationId: conversation.id,
      messageType: MessageType.OUTGOING,
      contentType: ContentType.TEXT,
      senderType: SenderType.BOT,
      sourceId: null,
      content: step.stepType === "SEND_TEXT" ? step.message : null,
      // Create attachment if SEND_IMAGE and attachment data is provided
      ...(isSendImageStepWithAttachment(step)
        ? {
          attachments: {
            create: {
              chatbotId: conversation.chatbotId,
              conversationId: conversation.id,
              originPath: step.attachment.originPath,
              name: step.attachment.name,
              mimeType: step.attachment.mimeType,
              size: step.attachment.size,
              width: step.attachment.width,
              height: step.attachment.height,
              fileType: step.attachment.fileType,
            },
          },
        }
        : {}),
    },
    include: {
      attachments: true,
    },
  })

  const messageWithAttachments = {
    ...message,
    attachments:
      message.attachments?.map((attachment) => ({
        ...attachment
      })) || [],
  }

  const promises: Promise<unknown>[] = [
    broadcastToChatbotParty(conversation.chatbotId, {
      eventType: RealtimeEventType.CREATE_MESSAGE,
      data: messageWithAttachments,
    }),
  ]
  if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
    promises.push(
      broadcastToGuestParty(conversation.sourceId, {
        eventType: RealtimeEventType.CREATE_MESSAGE,
        data: messageWithAttachments,
      }),
    )
  } else {
    const isTextOrImage =
      step.stepType === "SEND_TEXT" || step.stepType === "SEND_IMAGE"
    if (isTextOrImage) {
      promises.push(
        sendFlowStepToExternal({
          conversation: conversation as ConversationEntity,
          flowVersionId,
          // biome-ignore lint/suspicious/noExplicitAny: upstream type not exported; runtime validated
          step: step as any,
        }),
      )
    }
  }

  await Promise.all(promises)
}
