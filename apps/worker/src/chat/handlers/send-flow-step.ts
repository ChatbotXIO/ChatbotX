import { db, findOrFail } from "@aha.chat/database/client"
import {
  attachmentModel,
  contactModel,
  inboxModel,
  messageModel,
} from "@aha.chat/database/schema"
import {
  type AttachmentModel,
  type ContactModel,
  type InboxModel,
  WEBCHAT_SOURCE_PREFIX,
} from "@aha.chat/database/types"
import { getPublicUrl } from "@aha.chat/database/utils"
import { uploadFileFromUrl } from "@aha.chat/filesystem/node-upload"
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
  AuthValue,
  MessageButtonTemplate,
  MessageCardTemplate,
  MessageTemplateEntity,
  OutgoingMessage,
  SendFlowStepData,
  SendTypingProps,
} from "@aha.chat/sdk"
import type {
  ChatJobSendChatMessage,
  ChatJobSendFlowStep,
} from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"
import { allIntegrations } from "../../lib/integrations"
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
  const conversation = await db.query.conversationModel.findFirst({
    where: { id: conversationId },
    with: { contact: true },
  })
  if (!conversation) {
    return
  }

  try {
    const message = await db.transaction(async (tx) => {
      const messageData: typeof messageModel.$inferInsert = {
        id: createId(),
        inboxId: conversation.inboxId,
        chatbotId: conversation.chatbotId,
        conversationId: conversation.id,
        messageType: "outgoing",
        contentType: "text",
        senderType: "bot",
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
      const newMessage = await tx
        .insert(messageModel)
        .values(messageData)
        .returning()
        .then((result) => result[0])

      // Upload file if exists
      let attachment: AttachmentModel | undefined
      if ("url" in step) {
        const uploadedFile = await uploadFileFromUrl(
          step.url,
          `public/chatbots/${newMessage.chatbotId}/conversations/${conversation.id}/${createId()}`,
        )

        attachment = await tx
          .insert(attachmentModel)
          .values({
            id: createId(),
            chatbotId: conversation.chatbotId,
            conversationId: conversation.id,
            messageId: newMessage.id,
            ...uploadedFile,
          })
          .returning()
          .then((result) => ({
            ...result[0],
            url: getPublicUrl(result[0].originPath),
          }))

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
          conversation,
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

export const sendChatMessage = async (
  props: ChatJobSendChatMessage["data"],
) => {
  const { conversation, text, url } = props

  try {
    const message = await db.transaction(async (tx) => {
      const newMessage = await db
        .insert(messageModel)
        .values({
          id: createId(),
          inboxId: conversation.inboxId,
          chatbotId: conversation.chatbotId,
          conversationId: conversation.id,
          messageType: "outgoing",
          contentType: "text",
          senderType: "bot",
          sourceId: null,
          content: text,
        })
        .returning()
        .then((result) => result[0])

      if (url) {
        const uploadedFile = await uploadFileFromUrl(
          url,
          `public/chatbots/${newMessage.chatbotId}/conversations/${conversation.id}/${createId()}`,
        )

        const attachment = await tx
          .insert(attachmentModel)
          .values({
            id: createId(),
            chatbotId: conversation.chatbotId,
            conversationId: conversation.id,
            messageId: newMessage.id,
            ...uploadedFile,
          })
          .returning()
          .then((result) => ({
            ...result[0],
            url: getPublicUrl(result[0].originPath),
          }))

        ;(newMessage as { attachments?: AttachmentModel[] }).attachments = [
          attachment,
        ]
      }

      return newMessage
    })

    const { inbox, auth } = await getInboxWithAuthFromInboxId(
      conversation.inboxId,
    )

    const contact = await findOrFail<ContactModel>(
      contactModel,
      {
        where: { id: conversation.contactId },
      },
      `Contact not found for conversationId: ${conversation.id}`,
    )

    await allIntegrations[
      inbox.inboxType
    ]?.channels?.channel?.message?.sendMessage?.({
      ctx: {
        chatbot: inbox.chatbot,
        auth,
      },
      data: {
        contact,
        conversation,
        message: message as OutgoingMessage,
      },
    })

    await allIntegrations.chatbotx?.channels?.channel?.message?.sendMessage?.({
      ctx: {
        chatbot: inbox.chatbot,
        auth,
      },
      data: {
        contact,
        conversation,
        message: message as OutgoingMessage,
      },
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
          conversation,
          message: message as OutgoingMessage,
        }),
      )
    }

    await Promise.all(promises)
  } catch (error) {
    logger.error(
      error,
      `sendChatMessage error for conversationId: ${conversation.id}`,
    )
  }
}

export const sendTyping = async (
  props: SendTypingProps<AuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation, typing },
  } = props

  const inbox = await findOrFail<InboxModel>(
    inboxModel,
    {
      id: conversation.inboxId,
    },
    `Inbox ${conversation.inboxId} not found for conversationId: ${conversation.id}`,
  )

  await allIntegrations[
    inbox.inboxType
  ]?.channels?.channel?.conversation?.sendTyping?.({
    ctx,
    data: { conversation, typing },
  })
}
