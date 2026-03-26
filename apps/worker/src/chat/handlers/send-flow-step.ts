import { db, eq, findOrFail } from "@aha.chat/database/client"
import {
  attachmentModel,
  contactModel,
  inboxModel,
  messageModel,
} from "@aha.chat/database/schema"
import {
  type AttachmentModel,
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
import { contactTrackingService } from "@chatbotx.io/analytics"
import { createId } from "@paralleldrive/cuid2"
import { trackBotResponse } from "../../integration/handlers/automated-response/track-bot-response"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"
import { allIntegrations } from "../../lib/integrations"
import { logger } from "../../lib/logger"
import { sendFlowStepToExternal, sendMessageToExternal } from "./send-message"
import { processWhatsappTemplate } from "./send-whatsapp-template"

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
  trackingContext,
}: ChatJobSendFlowStep["data"]) {
  const conversation = await db.query.conversationModel.findFirst({
    where: { id: conversationId },
    with: { contact: true, inbox: { columns: { channel: true } } },
  })
  if (!conversation) {
    return
  }

  if (step.stepType === StepType.sendWaTemplateMessage) {
    if (conversation.channel !== "whatsapp") {
      return
    }

    try {
      await processWhatsappTemplate({
        conversation,
        templateId: step.template.id,
        templateName: step.template.name,
        templateLanguage: step.template.languageCode,
        templateParams: step.template.params,
        flowId,
        flowVersionId,
        trackingContext,
      })
    } catch (error) {
      logger.error(
        error,
        `sendFlowStep WhatsApp template error for conversationId: ${conversationId}`,
      )
    }

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
        }).then(async (result) => {
          const firstMessageId = result?.messageIds?.[0]

          if (firstMessageId && message && typeof message !== "string") {
            await db
              .update(messageModel)
              .set({
                sourceId: firstMessageId,
              })
              .where(eq(messageModel.id, message.id))
          }
        }),
      )
    }

    await Promise.all(promises)

    if (conversation.contact?.sourceId) {
      const _inbox = await db.query.inboxModel.findFirst({
        where: { id: conversation.inboxId },
        columns: { channel: true },
      })
      contactTrackingService
        .trackEvent({
          chatbotId: conversation.chatbotId,
          contactId: conversation.contact.sourceId,
          eventType: "contact_message_out",
          senderType: "bot",
          occurredAt: new Date(),
          source: conversation.contact.source,
          sourceId: conversation.contact.sourceId,
          channel: conversation.channel,
          metadata: {
            triggerContext: {
              triggerSource: "worker",
              triggerHandler: "sendFlowStep",
              triggerType: "bot_message_out_flow",
            },
          },
        })
        .catch((error) => {
          logger.error(
            error,
            "[sendFlowStep] Failed to track contact_message_out",
          )
        })
    }

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: true,
        routeType: "FLOW",
        result: "SUCCESS",
        metadata: {
          flowId,
        },
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendFlowStep",
          triggerType: trackingContext.triggerType,
        },
      })
    }
  } catch (error) {
    logger.error(
      error,
      `sendFlowStep error for conversationId: ${conversationId}`,
    )

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: false,
        routeType: "FLOW",
        result: "FALLBACK",
        metadata: {
          flowId,
          fallbackReason: "HANDLER_ERROR_TO_FALLBACK",
        },
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendFlowStep",
          triggerType: `${trackingContext.triggerType}_failed`,
        },
      })
    }
  }
}

export const sendChatMessage = async (
  props: ChatJobSendChatMessage["data"],
) => {
  const { text, url, trackingContext } = props

  const conversationId =
    "conversation" in props ? props.conversation.id : props.conversationId
  const conversation =
    "conversation" in props
      ? props.conversation
      : await db.query.conversationModel.findFirst({
          where: { id: props.conversationId },
        })

  if (!conversation) {
    logger.error(`Conversation not found for conversationId: ${conversationId}`)
    return
  }

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

    const contact = await findOrFail(
      contactModel,
      { id: conversation.contactId },
      `Contact not found for conversationId: ${conversation.id}`,
    )

    await allIntegrations[
      inbox.channel
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

    if (contact.sourceId) {
      contactTrackingService
        .trackEvent({
          chatbotId: conversation.chatbotId,
          contactId: contact.sourceId,
          eventType: "contact_message_out",
          senderType: "bot",
          occurredAt: new Date(),
          source: contact.source,
          sourceId: contact.sourceId,
          channel: inbox.channel,
          metadata: {
            triggerContext: {
              triggerSource: "worker",
              triggerHandler: "sendChatMessage",
              triggerType: "bot_message_out_chat",
            },
          },
        })
        .catch((error) => {
          logger.error(
            error,
            "[sendChatMessage] Failed to track contact_message_out",
          )
        })
    }

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: true,
        routeType:
          trackingContext.responseType === "AUTOMATED_RESPONSE"
            ? "FLOW"
            : "AGENT",
        result: "SUCCESS",
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendChatMessage",
          triggerType: trackingContext.triggerType,
        },
      })
    }
  } catch (error) {
    logger.error(
      error,
      `sendChatMessage error for conversationId: ${conversation.id}`,
    )

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: false,
        routeType:
          trackingContext.responseType === "AUTOMATED_RESPONSE"
            ? "FLOW"
            : "AGENT",
        result: "FALLBACK",
        metadata: {
          fallbackReason: "HANDLER_ERROR_TO_FALLBACK",
        },
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendChatMessage",
          triggerType: `${trackingContext.triggerType}_failed`,
        },
      })
    }
  }
}

export const sendTyping = async (
  props: SendTypingProps<AuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation, typing },
  } = props

  const inbox = await findOrFail(
    inboxModel,
    {
      id: conversation.inboxId,
    },
    `Inbox ${conversation.inboxId} not found for conversationId: ${conversation.id}`,
  )

  await allIntegrations[
    inbox.channel
  ]?.channels?.channel?.conversation?.sendTyping?.({
    ctx,
    data: { conversation, typing },
  })
}
