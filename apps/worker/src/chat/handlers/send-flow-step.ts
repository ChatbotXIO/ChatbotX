import {
  botMessageFallbackReasons,
  botMessageResults,
  botMessageRouteTypes,
  trackingResponseTypes,
} from "@chatbotx.io/analytics"
import {
  broadcastToGuestParty,
  broadcastToWorkspaceParty,
  resolvePlatformSettings,
} from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db, eq } from "@chatbotx.io/database/client"
import {
  channelTypes,
  contentTypes,
  messageTypes,
  senderTypes,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  type messageModel,
} from "@chatbotx.io/database/schema"
import type { AttachmentModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem/node-upload"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import {
  appendCodeToMagicLink,
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
  messageEventTypeSchema,
  type SendCardStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import {
  IntegrationException,
  type MessageButtonTemplate,
  type MessageCardTemplate,
  parseSdkError,
  type SendFlowStepData,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"
import type {
  ChatJobSendChatMessage,
  ChatJobSendFlowStep,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { sendFlowStepToChannel, sendMessageToChannel } from "./send-message"
import { processMessengerTemplate } from "./send-messenger-template"
import { processWhatsappTemplate } from "./send-whatsapp-template"

export const convertButtonsToTemplate = (props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
  contactInboxId?: string
}): MessageButtonTemplate[] => {
  const { flowId, flowVersionId, buttons, metadata, contactInboxId } = props
  const broadcastId = extractMetadata("broadcastId", metadata)
  const sequenceStepId = extractMetadata("sequenceStepId", metadata)

  return buttons.map((button) => {
    const buttonPayload = encodeButtonPayload({
      flowId,
      flowVersionId,
      buttonId: button.id,
      broadcastId,
      sequenceStepId,
      contactInboxId,
    })

    if (button.buttonType === buttonTypes.enum.openWebsite) {
      return {
        id: button.id,
        label: button.label,
        buttonType: "url",
        url: appendCodeToMagicLink(button.beforeStep.url, buttonPayload),
      }
    }

    return {
      id: button.id,
      buttonType: "postback",
      label: button.label,
      postback: buttonPayload,
    }
  })
}

const convertCardsToTemplate = (props: {
  flowId: string
  flowVersionId?: string
  cards: SendCardStepSchema[]
  metadata?: MetadataPayload
  contactInboxId?: string
}): MessageCardTemplate[] => {
  const { flowId, flowVersionId, cards, metadata, contactInboxId } = props

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
            metadata,
            contactInboxId,
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
  metadata,
  sendFrom,
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
        contactInbox: targetContactInbox,
        template: {
          id: step.template.id,
          name: step.template.name,
          language: step.template.language,
          params: step.template.params,
        },
        flow: {
          id: flowId,
          versionId: flowVersionId,
          buttons: step?.buttons ?? [],
        },
        step,
        trackingContext,
        metadata,
      })
    } catch (error) {
      logger.error(
        error,
        `sendFlowStep WhatsApp template error for conversationId: ${conversationId}`,
      )
    }

    return
  }

  if (step.stepType === stepTypes.enum.sendMessengerTemplateMessage) {
    if (targetContactInbox.channel !== channelTypes.enum.messenger) {
      return
    }

    try {
      await processMessengerTemplate({
        conversation,
        contactInbox: targetContactInbox,
        template: {
          id: step.template.id,
          name: step.template.name,
          language: step.template.language,
          parameterFormat: step.template.parameterFormat,
          params: step.template.params,
        },
        flow: {
          id: flowId,
          versionId: flowVersionId,
        },
        step,
        trackingContext,
        metadata,
      })
    } catch (error) {
      logger.error(
        error,
        `sendFlowStep Messenger template error for conversationId: ${conversationId}`,
      )
    }

    return
  }

  const eventLogData = {
    context: {
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      channel: targetContactInbox.channel,
      contactInboxId: targetContactInbox.id,
      inboxId: targetContactInbox.inboxId,
    },
    action: {
      flowId,
      flowVersionId,
    },
    metadata,
    stepId: step.id,
    nodeId: step.nodeId,
  }

  const resolvedStep = await resolveContactVariablesDeep(
    conversation.contactId,
    step,
  )
  const messageText =
    resolvedStep.stepType === stepTypes.enum.sendText ? resolvedStep.text : null

  try {
    const [repository, { storageUrl }] = await Promise.all([
      createMessageRepository(),
      resolvePlatformSettings({ workspaceId: conversation.workspaceId }),
    ])

    let contentAttributes: (typeof messageModel.$inferInsert)["contentAttributes"] =
      {
        metadata,
        stepId: resolvedStep.id,
        nodeId: resolvedStep.nodeId,
        flowId,
        flowVersionId,
      }

    if ("buttons" in resolvedStep && resolvedStep.buttons.length > 0) {
      contentAttributes = {
        type: "template",
        payload: {
          templateType: "button",
          buttons: convertButtonsToTemplate({
            flowId,
            flowVersionId,
            buttons: resolvedStep.buttons,
            metadata,
            contactInboxId: targetContactInbox.id,
          }),
        },
        ...contentAttributes,
      }
    }
    if ("cards" in resolvedStep && resolvedStep.cards.length > 0) {
      contentAttributes = {
        type: "template",
        payload: {
          templateType: "carousel",
          cards: convertCardsToTemplate({
            flowId,
            flowVersionId,
            cards: resolvedStep.cards,
            metadata,
            contactInboxId: targetContactInbox.id,
          }),
        },
        ...contentAttributes,
      }
    }

    const messageInput = {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      contactInboxId: targetContactInbox.id,
      messageType: messageTypes.enum.outgoing,
      contentType: contentTypes.enum.text,
      senderType: senderTypes.enum.bot,
      sourceId: null,
      text: messageText,
      contentAttributes,
      createdAt: new Date(),
    }

    // Upload file if exists
    let attachmentInput:
      | Parameters<typeof repository.createWithAttachments>[1][0]
      | undefined
    if ("url" in step) {
      const uploadedFile = await uploadFileFromUrl(
        step.url,
        `public/space/${conversation.workspaceId}/conversations/${conversation.id}/${createId()}`,
      )
      attachmentInput = {
        ...uploadedFile,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      }
    }

    const message = attachmentInput
      ? await repository.createWithAttachments(messageInput, [attachmentInput])
      : await repository.create(messageInput)

    // Add url to attachments for response
    if ("attachments" in message && Array.isArray(message.attachments)) {
      ;(message as { attachments: AttachmentModel[] }).attachments =
        message.attachments.map((att) => ({
          ...att,
          url: getPublicFileUrl(att.originPath, storageUrl),
        }))
    }

    await db
      .update(contactInboxModel)
      .set({ lastMessageAt: message.createdAt })
      .where(eq(contactInboxModel.id, targetContactInbox.id))

    const promises: Promise<unknown>[] = [
      broadcastToWorkspaceParty(conversation.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
      sendFlowStepToChannel({
        conversation,
        contactInbox: targetContactInbox,
        flowId,
        flowVersionId,
        step: resolvedStep as SendFlowStepData,
        metadata,
        messageId: message?.id,
        sendFrom,
      }),
    ]

    if (targetContactInbox.channel === channelTypes.enum.webchat) {
      promises.push(
        broadcastToGuestParty(
          {
            workspaceId: conversation.workspaceId,
            guestConversationId: targetContactInbox.sourceId,
          },
          {
            eventType: RealtimeEventType.messageCreated,
            data: message,
          },
        ),
      )
    }

    await Promise.all(promises)
    await emit(messageEventTypeSchema.enum["message:sent"], {
      ...eventLogData,
      action: { messageId: "", flowId },
      occurredAt: new Date(),
    })

    // Send contact tracking event
    emit("analytics:dashboard", {
      eventType: "message:bot_sent",
      workspaceId: conversation.workspaceId,
      contactId: targetContactInbox.contactId,
      senderType: "bot",
      occurredAt: new Date(),
      source: targetContactInbox.source,
      sourceId: targetContactInbox.sourceId,
      channel: targetContactInbox.channel,
      metadata: {
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendFlowStep",
          triggerType: "message_bot_sent_flow",
        },
      },
    })

    if (trackingContext) {
      await emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: trackingContext.workspaceId,
        conversationId: trackingContext.conversationId,
        messageId: trackingContext.messageId,
        occurredAt: new Date(),
        hasResponse: true,
        responseType: trackingContext.responseType,
        routeType: "flow",
        result: "success",
        aiProvider: trackingContext.aiProvider,
        metadata: {
          latency: Date.now() - trackingContext.startTime,
          flowId,
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "sendFlowStep",
            triggerType: trackingContext.triggerType,
          },
        },
      })
    }
  } catch (error) {
    const parsedError = await parseSdkError(error)

    logger.error(
      error,
      `sendFlowStep error for conversationId: ${conversationId}`,
    )

    await emit(messageEventTypeSchema.enum["message:failed"], {
      ...eventLogData,
      action: {
        messageId: "",
        flowId,
      },
      errorData: parsedError,
      occurredAt: new Date(),
    })

    if (trackingContext) {
      await emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: trackingContext.workspaceId,
        conversationId: trackingContext.conversationId,
        messageId: trackingContext.messageId,
        occurredAt: new Date(),
        hasResponse: false,
        responseType: trackingContext.responseType,
        routeType: botMessageRouteTypes.enum.flow,
        result: botMessageResults.enum.fallback,
        aiProvider: trackingContext.aiProvider,
        metadata: {
          latency: Date.now() - trackingContext.startTime,
          flowId,
          fallbackReason:
            botMessageFallbackReasons.enum.handler_error_to_fallback,
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "sendFlowStep",
            triggerType: `${trackingContext.triggerType}_failed`,
          },
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
    metadata,
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

  if (!(text || url)) {
    return
  }

  try {
    const [repository, { storageUrl }] = await Promise.all([
      createMessageRepository(),
      resolvePlatformSettings({ workspaceId: conversation.workspaceId }),
    ])

    const messageInput = {
      contactInboxId: contactInbox.id,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      messageType: "outgoing" as const,
      contentType: "text" as const,
      senderType: "bot" as const,
      sourceId: null,
      text,
      contentAttributes: {
        metadata,
      },
      createdAt: new Date(),
    }

    let attachmentInput:
      | Parameters<typeof repository.createWithAttachments>[1][0]
      | undefined
    if (url) {
      const uploadedFile = await uploadFileFromUrl(
        url,
        `public/space/${conversation.workspaceId}/conversations/${conversation.id}/${createId()}`,
      )
      attachmentInput = {
        ...uploadedFile,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      }
    }

    const message = attachmentInput
      ? await repository.createWithAttachments(messageInput, [attachmentInput])
      : await repository.create(messageInput)

    // Add url to attachments for response
    if ("attachments" in message && Array.isArray(message.attachments)) {
      ;(message as { attachments: AttachmentModel[] }).attachments =
        message.attachments.map((att) => ({
          ...att,
          url: getPublicFileUrl(att.originPath, storageUrl),
        }))
    }

    await db
      .update(contactInboxModel)
      .set({ lastMessageAt: message.createdAt })
      .where(eq(contactInboxModel.id, contactInbox.id))

    const promises: Promise<unknown>[] = [
      broadcastToWorkspaceParty(conversation.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
      sendMessageToChannel({
        conversation,
        contactInbox,
        message,
        metadata,
      }),
    ]

    await Promise.all(promises)

    emit("analytics:dashboard", {
      eventType: "message:bot_sent",
      workspaceId: conversation.workspaceId,
      contactId: contactInbox.contactId,
      senderType: "bot",
      occurredAt: new Date(),
      source: contactInbox.source,
      sourceId: contactInbox.sourceId,
      channel: contactInbox.channel,
      metadata: {
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendChatMessage",
          triggerType: "message_bot_sent_chat",
        },
      },
    })

    if (trackingContext) {
      await emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: trackingContext.workspaceId,
        conversationId: trackingContext.conversationId,
        messageId: trackingContext.messageId,
        occurredAt: new Date(),
        hasResponse: true,
        responseType: trackingContext.responseType,
        routeType:
          trackingContext.responseType ===
          trackingResponseTypes.enum.automated_response
            ? botMessageRouteTypes.enum.flow
            : botMessageRouteTypes.enum.agent,
        result: botMessageResults.enum.success,
        aiProvider: trackingContext.aiProvider,
        metadata: {
          latency: Date.now() - trackingContext.startTime,
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "sendChatMessage",
            triggerType: trackingContext.triggerType,
          },
        },
      })
    }
  } catch (error) {
    logger.error(
      error,
      `sendChatMessage error for conversationId: ${conversation.id}`,
    )

    if (trackingContext) {
      await emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: trackingContext.workspaceId,
        conversationId: trackingContext.conversationId,
        messageId: trackingContext.messageId,
        occurredAt: new Date(),
        hasResponse: false,
        responseType: trackingContext.responseType,
        routeType:
          trackingContext.responseType ===
          trackingResponseTypes.enum.automated_response
            ? botMessageRouteTypes.enum.flow
            : botMessageRouteTypes.enum.agent,
        result: botMessageResults.enum.fallback,
        aiProvider: trackingContext.aiProvider,
        metadata: {
          latency: Date.now() - trackingContext.startTime,
          fallbackReason:
            botMessageFallbackReasons.enum.handler_error_to_fallback,
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "sendChatMessage",
            triggerType: `${trackingContext.triggerType}_failed`,
          },
        },
      })
    }
  }
}
