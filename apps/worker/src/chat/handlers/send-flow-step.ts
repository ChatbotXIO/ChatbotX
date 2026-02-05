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
import { uploadFileFromUrl } from "@aha.chat/filesystem"
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
import type {
  ConversationEntity,
  MessageButtonTemplate,
  MessageCardTemplate,
  MessageEntity,
  MessageTemplateEntity,
  SendFlowStepData,
} from "@aha.chat/sdk"
import type {
  ChatJobSendChatMessage,
  ChatJobSendFlowStep,
} from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { logger } from "../../lib/logger"
import { sendFlowStepToExternal, sendMessageToExternal } from "./send-message"

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
        const uploadedFile = await uploadFileFromUrl(
          step.url,
          `public/chatbots/${newMessage.chatbotId}/conversations/${conversation.id}/${createId()}`,
        )

        attachment = await tx.attachment.create({
          data: {
            chatbotId: conversation.chatbotId,
            conversationId: conversation.id,
            messageId: newMessage.id,
            ...uploadedFile,
          },
        })
        ;(newMessage as { attachments?: AttachmentModel[] }).attachments =
          attachment ? [attachment] : undefined
      }

      return newMessage
    })

    const promises: Promise<unknown>[] = [
      broadcastToChatbotParty(conversation.chatbotId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
    ]
    if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
      promises.push(
        broadcastToGuestParty(conversation.sourceId, {
          eventType: RealtimeEventType.messageCreated,
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
    logger.error(
      error,
      `sendFlowStep error for conversationId: ${conversationId}`,
    )
  }
}

export async function sendChatMessage({
  conversationId,
  text,
  url,
}: ChatJobSendChatMessage["data"]) {
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
        content: text,
      }

      const newMessage = await prisma.message.create({
        data: messageData,
      })

      if (url) {
        const uploadedFile = await uploadFileFromUrl(
          url,
          `public/chatbots/${newMessage.chatbotId}/conversations/${conversation.id}/${createId()}`,
        )

        const attachment = await tx.attachment.create({
          data: {
            chatbotId: conversation.chatbotId,
            conversationId: conversation.id,
            messageId: newMessage.id,
            ...uploadedFile,
          },
        })
        ;(newMessage as { attachments?: AttachmentModel[] }).attachments = [
          attachment,
        ]
      }

      return newMessage
    })

    const promises: Promise<unknown>[] = [
      broadcastToChatbotParty(conversation.chatbotId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
    ]
    if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
      promises.push(
        broadcastToGuestParty(conversation.sourceId, {
          eventType: RealtimeEventType.messageCreated,
          data: message,
        }),
      )
    } else {
      promises.push(
        sendMessageToExternal({
          conversation: conversation as ConversationEntity,
          message: message as MessageEntity,
        }),
      )
    }

    await Promise.all(promises)
  } catch (error) {
    logger.error(
      error,
      `sendChatMessage error for conversationId: ${conversationId}`,
    )
  }
}
