import {
  ContentType,
  MessageType,
  type Prisma,
  prisma,
  SenderType,
} from "@aha.chat/database"
import {
  type AttachmentModel,
  WEBCHAT_SOURCE_PREFIX,
} from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import {
  type ButtonStepProps,
  ButtonType,
  encodeButtonPayload,
  type SendCardStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import {
  type ConversationEntity,
  guessFileTypeFromMimeType,
  type MessageButtonTemplate,
  type MessageCardTemplate,
  type MessageTemplateEntity,
  type SendFlowStepData,
} from "@aha.chat/sdk"
import type { ChatJobSendFlowStep } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { format } from "date-fns"
import imageSize from "image-size"
import { logger } from "../../lib/logger"
import { sendFlowStepToExternal } from "./send-message"

const convertButtonsToTemplate = (props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
}): MessageButtonTemplate[] => {
  const { flowId, flowVersionId, buttons } = props
  return buttons.map((button) => {
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
  })
}

const convertCardsToTemplate = (props: {
  flowId: string
  flowVersionId?: string
  cards: SendCardStepSchema[]
}): MessageCardTemplate[] => {
  const { flowId, flowVersionId, cards } = props

  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    subtitle: "subtitle" in card ? card.subtitle : undefined,
    imageUrl: "image" in card ? card.image?.url : undefined,
    buttons:
      "buttons" in card
        ? convertButtonsToTemplate({
            flowId,
            flowVersionId,
            buttons: card.buttons,
          })
        : undefined,
  }))
}

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

  try {
    const message = await prisma.$transaction(async (tx) => {
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
            buttons: convertButtonsToTemplate({
              flowId,
              flowVersionId,
              buttons: step.buttons,
            }),
          },
        } satisfies MessageTemplateEntity
      }
      if ("cards" in step && step.cards.length > 0) {
        messageData.contentAttributes = {
          type: "template",
          payload: {
            templateType: "carousel",
            cards: convertCardsToTemplate({
              flowId,
              flowVersionId,
              cards: step.cards,
            }),
          },
        } satisfies MessageTemplateEntity
      }
      const newMessage = await prisma.message.create({
        data: messageData,
      })

      // Upload file if exists
      let attachment: AttachmentModel | undefined
      if ("url" in step) {
        const response = await fetch(step.url, {
          headers: {
            "User-Agent": "node",
          },
        })
        if (response.ok && response.body) {
          const originPath = `public/chatbots/${newMessage.chatbotId}/${format(new Date(), "yyyyMMdd")}/${createId()}`
          const bytes = await response.arrayBuffer()
          const mimeType =
            response.headers.get("content-type") ?? "application/octet-stream"
          const fileType = guessFileTypeFromMimeType(mimeType)

          await uploader.putObject(originPath, Buffer.from(bytes), {
            ACL: "public-read",
            ContentType: mimeType,
          })

          const imageProperties: {
            width?: number
            height?: number
          } = {}
          if (mimeType.startsWith("image/")) {
            // Retrieve width / height
            const arrayBytes = new Uint8Array(bytes)
            const dimensions = imageSize(arrayBytes)
            imageProperties.width = dimensions.width
            imageProperties.height = dimensions.height
          }

          attachment = await tx.attachment.create({
            data: {
              chatbotId: conversation.chatbotId,
              conversationId: conversation.id,
              messageId: newMessage.id,
              originPath: step.url,
              name: "Attachment",
              mimeType,
              size: Number.parseInt(
                response.headers.get("content-length") ?? "0",
                10,
              ),
              fileType,
              sourceId: null,
              ...imageProperties,
            },
          })
        }

        ;(newMessage as { attachments?: AttachmentModel[] }).attachments =
          attachment ? [attachment] : undefined
      }

      return newMessage
    })

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

    await Promise.all(promises)
  } catch (error) {
    logger.error("sendFlowStep error", error)
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
}
