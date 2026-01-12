import {
  ContentType,
  MessageType,
  type Prisma,
  prisma,
  SenderType,
} from "@aha.chat/database"
import { WEBCHAT_SOURCE_PREFIX } from "@aha.chat/database/types"
import {
  ButtonType,
  encodeButtonPayload,
  StepType,
} from "@aha.chat/flow-config"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type {
  ConversationEntity,
  MessageTemplateEntity,
  SendFlowStepData,
} from "@aha.chat/sdk"
import type { ChatJobSendFlowStep } from "@aha.chat/worker-config"
import { sendFlowStepToExternal } from "./send-message"

export async function sendFlowStep({
  conversationId,
  flowId,
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

  const messageData: Prisma.MessageUncheckedCreateInput = {
    inboxId: conversation.inboxId,
    chatbotId: conversation.chatbotId,
    conversationId: conversation.id,
    messageType: MessageType.outgoing,
    contentType: ContentType.text,
    senderType: SenderType.bot,
    sourceId: null,
    content: step.stepType === StepType.sendText ? step.message : null,
  }
  if ("buttons" in step && step.buttons.length > 0) {
    messageData.contentAttributes = {
      type: "template",
      payload: {
        templateType: "button",
        buttons: step.buttons.map((button) => {
          if (button.buttonType === ButtonType.OpenWebsite) {
            return {
              id: button.id,
              label: button.label,
              buttonType: "url",
              url: button.beforeStep.url,
            }
          }

          return {
            id: button.id,
            buttonType: "postback",
            label: button.label,
            postback: encodeButtonPayload({
              flowId,
              flowVersionId,
              buttonId: button.id,
            }),
          }
        }),
      },
    } satisfies MessageTemplateEntity
  }
  const message = await prisma.message.create({
    data: messageData,
  })

  // If this is an image step, persist attachment linked to the message
  // if (step.stepType === StepType.sendImage && step.attachment) {
  //   const createdAttachment = await prisma.attachment.create({
  //     data: {
  //       chatbotId: conversation.chatbotId,
  //       conversationId: conversation.id,
  //       messageId: message.id,
  //       originPath: step.attachment.originPath,
  //       name: step.attachment.name ?? undefined,
  //       mimeType: step.attachment.mimeType,
  //       size: step.attachment.size,
  //       width: step.attachment.width,
  //       height: step.attachment.height,
  //       fileType: step.attachment.fileType,
  //       sourceId: null,
  //     },
  //   })
  //   // Attach to message for broadcasting so UI can render immediately
  //   ;(
  //     message as unknown as { attachments?: (typeof createdAttachment)[] }
  //   ).attachments = [createdAttachment]
  // }

  const promises: Promise<unknown>[] = [
    broadcastToChatbotParty(conversation.chatbotId, {
      eventType: RealtimeEventType.CREATE_MESSAGE,
      data: message,
    }),
  ]
  if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
    promises.push(
      broadcastToGuestParty(conversation.sourceId, {
        eventType: RealtimeEventType.CREATE_MESSAGE,
        data: message,
      }),
    )
  } else {
    promises.push(
      sendFlowStepToExternal({
        conversation: conversation as ConversationEntity,
        flowId,
        flowVersionId,
        step: step as SendFlowStepData,
      }),
    )
  }
  // else if (step.stepType === StepType.sendText) {
  //   // Only SEND_TEXT and SEND_IMAGE are supported for external at this layer
  //   promises.push(
  //     sendFlowStepToExternal({
  //       conversation: conversation as ConversationEntity,
  //       flowVersionId,
  //       step: {
  //         id: step.id,
  //         stepType: StepType.sendText,
  //         message: step.message,
  //         buttons: step.buttons,
  //       },
  //     }),
  //   )
  // } else if (step.stepType === StepType.sendImage) {
  //   promises.push(
  //     sendFlowStepToExternal({
  //       conversation: conversation as ConversationEntity,
  //       flowVersionId,
  //       step: {
  //         id: step.id,
  //         stepType: StepType.sendImage,
  //         mode: step.mode,
  //         url: step.url,
  //         buttons: step.buttons,
  //         // attachment is optional in schema
  //         attachment: step.attachment,
  //       },
  //     }),
  //   )
  // }

  await Promise.all(promises)
}
