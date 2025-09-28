import {
  ContentType,
  MessageType,
  prisma,
  SenderType,
} from "@aha.chat/database"
import { WEBCHAT_SOURCE_PREFIX } from "@aha.chat/database/types"
import { StepType } from "@aha.chat/flow-config"
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

  // Create message with attachment if SEND_IMAGE
  const message = await prisma.message.create({
    data: {
      inboxId: conversation.inboxId,
      chatbotId: conversation.chatbotId,
      conversationId: conversation.id,
      messageType: MessageType.OUTGOING,
      contentType: ContentType.TEXT,
      senderType: SenderType.BOT,
      sourceId: null,
      content: step.stepType === StepType.SEND_TEXT ? step.message : null,
      // Create attachment if SEND_IMAGE and attachment data is provided
      ...(step.stepType === StepType.SEND_IMAGE && (step as any).attachment ? {
        attachments: {
          create: {
            chatbotId: conversation.chatbotId,
            conversationId: conversation.id,
            originPath: (step as any).attachment.originPath,
            name: (step as any).attachment.name,
            mimeType: (step as any).attachment.mimeType,
            size: (step as any).attachment.size,
            width: (step as any).attachment.width,
            height: (step as any).attachment.height,
            fileType: (step as any).attachment.fileType,
          }
        }
      } : {})
    },
    include: {
      attachments: true,
    },
  })

  // Transform attachments to include url field
  const assetUrl = process.env.NEXT_PUBLIC_ASSET_URL || 'http://localhost:9000'
  const messageWithAttachments = {
    ...message,
    attachments: message.attachments?.map((attachment) => ({
      ...attachment,
      url: new URL(attachment.originPath, assetUrl).toString(),
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
      step.stepType === StepType.SEND_TEXT || step.stepType === StepType.SEND_IMAGE
    if (isTextOrImage) {
      promises.push(
        sendFlowStepToExternal({
          conversation: conversation as ConversationEntity,
          flowVersionId,
          // biome-ignore lint/suspicious/noExplicitAny: narrowed at runtime
          step: step as any,
        }),
      )
    }
  }

  await Promise.all(promises)
}
