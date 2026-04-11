import {
  botMessageFallbackReasons,
  botMessageResults,
  botMessageRouteTypes,
  contactEventTypes,
  contactTrackingService,
  trackingResponseTypes,
} from "@chatbotx.io/analytics"
import { db, eq } from "@chatbotx.io/database/client"
import {
  channelTypes,
  contentTypes,
  messageTypes,
  senderTypes,
} from "@chatbotx.io/database/partials"
import { attachmentModel, messageModel } from "@chatbotx.io/database/schema"
import type { AttachmentModel } from "@chatbotx.io/database/types"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem/node-upload"
import {
  type ButtonStepProps,
  ButtonType,
  encodeButtonPayload,
  type SendCardStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  broadcastToGuestParty,
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import {
  IntegrationException,
  type MessageButtonTemplate,
  type MessageCardTemplate,
  type MessageTemplateEntity,
  type SendFlowStepData,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import type {
  ChatJobSendChatMessage,
  ChatJobSendFlowStep,
} from "@chatbotx.io/worker-config"
import { trackBotResponse } from "../../integration/handlers/automated-response/track-bot-response"
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
    with: { contact: true },
  })
  if (!conversation) {
    return
  }

  // Temporary use the last contact inbox for the conversation
  const targetContactInbox = await db.query.contactInboxModel.findFirst({
    where: {
      contactId: conversation.contactId,
    },
    orderBy: {
      lastMessageAt: "desc",
    },
  })
  if (!targetContactInbox) {
    return
  }

  if (step.stepType === stepTypes.enum.sendWaTemplateMessage) {
    if (targetContactInbox.channel !== channelTypes.enum.whatsapp) {
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
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: targetContactInbox.id,
        messageType: messageTypes.enum.outgoing,
        contentType: contentTypes.enum.text,
        senderType: senderTypes.enum.bot,
        sourceId: null,
        text: step.stepType === stepTypes.enum.sendText ? step.text : null,
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
          `public/space/${newMessage.workspaceId}/conversations/${conversation.id}/${createId()}`,
        )

        attachment = await tx
          .insert(attachmentModel)
          .values({
            id: createId(),
            workspaceId: conversation.workspaceId,
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
      broadcastToWorkspaceParty(conversation.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
    ]
    if (targetContactInbox.channel === channelTypes.enum.webchat) {
      promises.push(
        broadcastToGuestParty(targetContactInbox.sourceId, {
          eventType: RealtimeEventType.messageCreated,
          data: message,
        }),
      )
    } else {
      promises.push(
        sendFlowStepToExternal({
          conversation,
          contactInbox: targetContactInbox,
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

    // Send contact tracking event
    contactTrackingService
      .trackEvent({
        workspaceId: conversation.workspaceId,
        contactId: targetContactInbox.contactId,
        eventType: contactEventTypes.enum.contact_message_out, // "contact_message_out",
        senderType: "bot",
        occurredAt: new Date(),
        source: targetContactInbox.source,
        sourceId: targetContactInbox.sourceId,
        channel: targetContactInbox.channel,
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

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: true,
        routeType: "flow",
        result: "success",
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
        routeType: botMessageRouteTypes.enum.flow,
        result: botMessageResults.enum.fallback,
        metadata: {
          flowId,
          fallbackReason:
            botMessageFallbackReasons.enum.handler_error_to_fallback,
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
  const {
    conversation,
    contactInbox: targetContactInbox,
    text,
    url,
    trackingContext,
  } = props

  const contactInbox =
    targetContactInbox ??
    (await db.query.contactInboxModel.findFirst({
      where: {
        contactId: conversation.contactId,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    }))
  if (!contactInbox) {
    throw new IntegrationException(
      `sendChatMessage: contact inbox not found for conversation ${conversation.id}`,
    )
  }

  try {
    const message = await db.transaction(async (tx) => {
      const newMessage = await tx
        .insert(messageModel)
        .values({
          id: createId(),
          contactInboxId: contactInbox.id,
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          messageType: "outgoing",
          contentType: "text",
          senderType: "bot",
          sourceId: null,
          text,
        })
        .returning()
        .then((result) => result[0])

      if (url) {
        const uploadedFile = await uploadFileFromUrl(
          url,
          `public/space/${newMessage.workspaceId}/conversations/${conversation.id}/${createId()}`,
        )

        const attachment = await tx
          .insert(attachmentModel)
          .values({
            id: createId(),
            workspaceId: conversation.workspaceId,
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

    const promises: Promise<unknown>[] = [
      broadcastToWorkspaceParty(conversation.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
    ]
    if (contactInbox.channel === channelTypes.enum.webchat) {
      promises.push(
        broadcastToGuestParty(contactInbox.sourceId, {
          eventType: RealtimeEventType.messageCreated,
          data: message,
        }),
      )
    } else {
      promises.push(
        sendMessageToExternal({
          conversation,
          contactInbox,
          message,
        }),
      )
    }

    await Promise.all(promises)

    contactTrackingService
      .trackEvent({
        workspaceId: conversation.workspaceId,
        contactId: contactInbox.contactId,
        eventType: "contact_message_out",
        senderType: "bot",
        occurredAt: new Date(),
        source: contactInbox.source,
        sourceId: contactInbox.sourceId,
        channel: contactInbox.channel,
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

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: true,
        routeType:
          trackingContext.responseType ===
          trackingResponseTypes.enum.automated_response
            ? botMessageRouteTypes.enum.flow
            : botMessageRouteTypes.enum.agent,
        result: botMessageResults.enum.success,
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
          trackingContext.responseType ===
          trackingResponseTypes.enum.automated_response
            ? botMessageRouteTypes.enum.flow
            : botMessageRouteTypes.enum.agent,
        result: botMessageResults.enum.fallback,
        metadata: {
          fallbackReason:
            botMessageFallbackReasons.enum.handler_error_to_fallback,
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
