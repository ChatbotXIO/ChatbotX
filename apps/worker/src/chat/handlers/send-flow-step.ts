import {
  botMessageFallbackReasons,
  botMessageResults,
  botMessageRouteTypes,
  trackingResponseTypes,
} from "@chatbotx.io/analytics"
import {
  appointmentCalendarService,
  broadcastToGuestParty,
  broadcastToWorkspaceParty,
  contactInboxService,
  conversationService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db, eq } from "@chatbotx.io/database/client"
import {
  channelTypes,
  contentTypes,
  messageTypes,
  senderTypes,
} from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  type MessageWithAttachments,
} from "@chatbotx.io/database/repositories"
import {
  conversationModel,
  type messageModel,
} from "@chatbotx.io/database/schema"
import type { AttachmentModel, MessageModel } from "@chatbotx.io/database/types"
import { signAppointmentWebviewToken } from "@chatbotx.io/encryption"
import { emit } from "@chatbotx.io/event-bus"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem"
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
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import {
  recordMessageSendError,
  sendFlowStepToChannel,
  sendMessageToChannel,
} from "./send-message"
import { processMessengerTemplate } from "./send-messenger-template"
import { processWhatsappTemplate } from "./send-whatsapp-template"

const CHANNEL_DELIVERABLE_STEP_TYPES = new Set<string>([
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendCard,
  stepTypes.enum.sendCarousel,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendGif,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendMessengerTemplateMessage,
  stepTypes.enum.sendQuickReply,
  stepTypes.enum.sendText,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendWaTemplateMessage,
  stepTypes.enum.whatsappFlow,
  stepTypes.enum.whatsappOptionList,
])

const isBlankTextCarrierStep = (step: SendFlowStepData) => {
  if (step.stepType === stepTypes.enum.sendText) {
    return !step.text.trim()
  }

  if (step.stepType === stepTypes.enum.sendQuickReply) {
    return !step.message.trim()
  }

  return false
}

const BOOKING_PUBLIC_LINK_PATH_REGEX = /^\/booking\/([^/]+)$/

const extractBookingPublicLinkSlug = (url: string): string | null => {
  try {
    const parsedUrl = new URL(url)
    const match = parsedUrl.pathname.match(BOOKING_PUBLIC_LINK_PATH_REGEX)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

const findTargetContactInbox = ({
  contactId,
  contactInboxId,
}: {
  contactId: string
  contactInboxId?: string
}) => {
  if (contactInboxId) {
    return db.query.contactInboxModel.findFirst({
      where: {
        id: contactInboxId,
        contactId,
      },
    })
  }

  return db.query.contactInboxModel.findFirst({
    where: {
      contactId,
    },
    orderBy: {
      lastMessageAt: "desc",
    },
  })
}

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
        postback: buttonPayload,
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

const signBookingButtonIfNeeded = async (props: {
  workspaceId: string
  contactId: string
  conversationId: string
  contactInboxId: string
  channel: string
  flowId: string
  flowVersionId?: string
  executedFlowVersionId?: string
  stepId: string
  appUrl: string
  button: ButtonStepProps
}): Promise<ButtonStepProps> => {
  const { button } = props
  if (!(button.buttonType === buttonTypes.enum.openWebsite)) {
    return button
  }
  const tokenFlowVersionId = props.flowVersionId ?? props.executedFlowVersionId
  if (!tokenFlowVersionId) {
    return button
  }

  const publicLinkSlug = extractBookingPublicLinkSlug(button.beforeStep.url)
  if (!publicLinkSlug) {
    return button
  }

  const calendar = await appointmentCalendarService.findByPublicLinkSlug({
    workspaceId: props.workspaceId,
    publicLinkSlug,
  })
  if (!calendar) {
    return button
  }

  const token = await signAppointmentWebviewToken({
    mode: "book",
    workspaceId: props.workspaceId,
    calendarId: calendar.id,
    contactId: props.contactId,
    conversationId: props.conversationId,
    contactInboxId: props.contactInboxId,
    channel: props.channel,
    flowId: props.flowId,
    flowVersionId: tokenFlowVersionId,
    stepId: props.stepId,
  })
  const pickerUrl = new URL("/booking/picker", props.appUrl)
  pickerUrl.searchParams.set("token", token)

  return {
    ...button,
    beforeStep: {
      ...button.beforeStep,
      url: pickerUrl.toString(),
    },
  }
}

const signBookingButtonsIfNeeded = async (props: {
  workspaceId: string
  contactId: string
  conversationId: string
  contactInboxId: string
  channel: string
  flowId: string
  flowVersionId?: string
  executedFlowVersionId?: string
  stepId: string
  appUrl: string
  buttons?: ButtonStepProps[]
}) => {
  if (!props.buttons?.length) {
    return props.buttons
  }
  return await Promise.all(
    props.buttons.map((button) =>
      signBookingButtonIfNeeded({ ...props, button }),
    ),
  )
}

const signBookingLinksInStep = async (props: {
  workspaceId: string
  contactId: string
  conversationId: string
  contactInboxId: string
  channel: string
  flowId: string
  flowVersionId?: string
  executedFlowVersionId?: string
  appUrl: string
  step: SendFlowStepData
}): Promise<SendFlowStepData> => {
  let step = props.step
  if ("buttons" in step && step.buttons.length > 0) {
    const buttons = await signBookingButtonsIfNeeded({
      ...props,
      stepId: step.id,
      buttons: step.buttons,
    })
    step = { ...step, buttons: buttons ?? [] } as SendFlowStepData
  }
  if (!("cards" in step) || step.cards.length === 0) {
    return step
  }
  const cards = await Promise.all(
    step.cards.map(async (card) => {
      if (!("buttons" in card) || card.buttons.length === 0) {
        return card
      }
      const buttons = await signBookingButtonsIfNeeded({
        ...props,
        stepId: step.id,
        buttons: card.buttons,
      })
      return { ...card, buttons: buttons ?? [] } as SendCardStepSchema
    }),
  )
  return { ...step, cards } as SendFlowStepData
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
  contactInboxId,
  flowId,
  flowVersionId,
  executedFlowVersionId,
  step,
  trackingContext,
  metadata,
  richResponse,
  quickReplies,
  sendFrom,
  commentAnchor,
  appointmentId,
}: ChatJobSendFlowStep["data"]) {
  const conversation = await db.query.conversationModel.findFirst({
    where: { id: conversationId },
    with: { contact: true },
  })
  if (!conversation) {
    return
  }

  const targetContactInbox = await findTargetContactInbox({
    contactId: conversation.contactId,
    contactInboxId,
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

  if (!CHANNEL_DELIVERABLE_STEP_TYPES.has(step.stepType)) {
    logger.debug(
      {
        conversationId,
        flowId,
        flowVersionId,
        stepId: step.id,
        stepType: step.stepType,
      },
      "Skipping non-deliverable flow step",
    )
    return
  }

  const resolvedStep = await resolveContactVariablesDeep(
    conversation.contactId,
    step,
    {
      contactInbox: targetContactInbox,
      conversation,
      ...(appointmentId ? { appointmentId } : {}),
    },
  )

  if (isBlankTextCarrierStep(resolvedStep as SendFlowStepData)) {
    logger.warn(
      {
        conversationId,
        flowId,
        flowVersionId,
        stepId: resolvedStep.id,
        stepType: resolvedStep.stepType,
      },
      "Skipping blank text flow step",
    )
    return
  }

  const messageText =
    resolvedStep.stepType === stepTypes.enum.sendText ? resolvedStep.text : null

  let message: MessageModel | MessageWithAttachments | undefined

  try {
    const [repository, tenantSettings] = await Promise.all([
      createMessageRepository(),
      resolveTenantSettings({ workspaceId: conversation.workspaceId }),
    ])
    const { appUrl, storageUrl } = tenantSettings
    const stepWithSignedBookingLinks = await signBookingLinksInStep({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      contactInboxId: targetContactInbox.id,
      channel: targetContactInbox.channel,
      flowId,
      flowVersionId,
      executedFlowVersionId,
      appUrl,
      step: resolvedStep as SendFlowStepData,
    })
    const quickRepliesWithSignedBookingLinks = await signBookingButtonsIfNeeded(
      {
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        contactInboxId: targetContactInbox.id,
        channel: targetContactInbox.channel,
        flowId,
        flowVersionId,
        executedFlowVersionId,
        stepId: stepWithSignedBookingLinks.id,
        appUrl,
        buttons: quickReplies,
      },
    )

    let contentAttributes: (typeof messageModel.$inferInsert)["contentAttributes"] =
      {
        metadata,
        richResponse,
        stepId: resolvedStep.id,
        nodeId: resolvedStep.nodeId,
        flowId,
        flowVersionId,
      }

    const canonicalQuickReplies =
      quickRepliesWithSignedBookingLinks &&
      quickRepliesWithSignedBookingLinks.length > 0
        ? convertButtonsToTemplate({
            flowId,
            flowVersionId,
            buttons: quickRepliesWithSignedBookingLinks,
            metadata,
            contactInboxId: targetContactInbox.id,
          })
        : undefined

    const canonicalStepButtons =
      "buttons" in stepWithSignedBookingLinks &&
      stepWithSignedBookingLinks.buttons.length > 0
        ? convertButtonsToTemplate({
            flowId,
            flowVersionId,
            buttons: stepWithSignedBookingLinks.buttons,
            metadata,
            contactInboxId: targetContactInbox.id,
          })
        : []

    const displayButtons = [
      ...canonicalStepButtons,
      ...(canonicalQuickReplies ?? []),
    ]

    if (displayButtons.length > 0) {
      contentAttributes = {
        type: "template",
        payload: {
          templateType: "button",
          buttons: displayButtons,
        },
        ...contentAttributes,
      }
    }
    if (
      "cards" in stepWithSignedBookingLinks &&
      stepWithSignedBookingLinks.cards.length > 0
    ) {
      contentAttributes = {
        type: "template",
        payload: {
          templateType: "carousel",
          cards: convertCardsToTemplate({
            flowId,
            flowVersionId,
            cards: stepWithSignedBookingLinks.cards,
            metadata,
            contactInboxId: targetContactInbox.id,
          }),
        },
        ...contentAttributes,
      }
    }

    const isPublicCommentReply = commentAnchor?.replyChannel === "public"
    if (isPublicCommentReply) {
      // Mirrors postPublicCommentReply's shape (comment-automation/index.ts) so
      // this message is recognized as a public comment reply below and routed
      // through sendMessageToChannel's "comment" channel group instead of a
      // normal flow DM. sendComment only reads text + the first attachment and
      // ignores buttons/quick replies/multiple cards — a carousel/button-heavy
      // first step degrades to best-effort text-and-first-attachment, same
      // precedent as the private-reply fix's Messenger-template gap.
      contentAttributes = {
        ...contentAttributes,
        replyToCommentId: commentAnchor.commentId,
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
      ...(isPublicCommentReply ? { type: "comment" as const } : {}),
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

    message = attachmentInput
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

    const createdMessage = message
    const trackingInvalidation = await db.transaction(async (tx) => {
      const invalidation =
        await contactInboxService.recordOutboundMessageCreated({
          tx,
          contactInboxId: targetContactInbox.id,
          contactId: targetContactInbox.contactId,
          workspaceId: conversation.workspaceId,
          at: createdMessage.createdAt,
        })

      await conversationService.updateFlowStepState({
        tx,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        lastActivityAt: createdMessage.createdAt,
        lastStep: conversation.currentStep,
        currentStep: resolvedStep.id,
      })

      return invalidation
    })
    await Promise.all([
      trackingInvalidation
        ? contactInboxService.invalidateTracking(trackingInvalidation)
        : Promise.resolve(),
      conversationService.invalidate({
        workspaceId: conversation.workspaceId,
        ids: [conversation.id],
      }),
    ])

    const channelSend = isPublicCommentReply
      ? sendMessageToChannel({
          conversation,
          contactInbox: targetContactInbox,
          message,
          quickReplies: canonicalQuickReplies,
          metadata,
          sendFrom,
        })
      : sendFlowStepToChannel({
          conversation,
          contactInbox: targetContactInbox,
          flowId,
          flowVersionId,
          step: stepWithSignedBookingLinks,
          metadata,
          richResponse,
          quickReplies: canonicalQuickReplies,
          messageId: message?.id,
          messageCreatedAt: message?.createdAt,
          sendFrom,
          // Comment-anchored private replies are Messenger-only (no Instagram
          // private_replies equivalent) — defensive re-check in case a resolved
          // contactInboxId ever points at a different channel than the job
          // intended. A "public" anchor never reaches this branch (routed to
          // sendMessageToChannel above instead).
          commentAnchor:
            targetContactInbox.channel === channelTypes.enum.messenger &&
            commentAnchor?.replyChannel === "private"
              ? commentAnchor
              : undefined,
        })

    const promises: Promise<unknown>[] = [
      broadcastToWorkspaceParty(conversation.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
      channelSend,
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

    const [, channelResult] = await Promise.all(promises)
    const providerMessageId = (
      channelResult as { messageIds?: string[] } | undefined
    )?.messageIds?.[0]

    await emit(messageEventTypeSchema.enum["message:sent"], {
      ...eventLogData,
      action: {
        flowId,
        flowVersionId,
        messageId: message.id,
        sourceId: providerMessageId,
      },
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
        messageId: message?.id ?? "",
        flowId,
      },
      errorData: parsedError,
      occurredAt: new Date(),
    })

    await recordMessageSendError(
      message?.id,
      undefined,
      conversation.workspaceId,
      message?.createdAt,
      parsedError.message,
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
    quickReplies,
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
      resolveTenantSettings({ workspaceId: conversation.workspaceId }),
    ])

    let attachmentInput:
      | Parameters<typeof repository.createWithAttachments>[1][0]
      | undefined
    let messageText = text

    if (url) {
      try {
        const uploadedFile = await uploadFileFromUrl(
          url,
          `public/space/${conversation.workspaceId}/conversations/${conversation.id}/${createId()}`,
        )
        attachmentInput = {
          ...uploadedFile,
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
        }
      } catch (uploadError) {
        logger.warn(
          {
            conversationId: conversation.id,
            workspaceId: conversation.workspaceId,
            url,
            error: normalizeError(uploadError),
          },
          "sendChatMessage: failed to download media url, falling back to text",
        )
        messageText = [text, url].filter(Boolean).join("\n")
      }
    }

    const messageInput = {
      contactInboxId: contactInbox.id,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      messageType: "outgoing" as const,
      contentType: "text" as const,
      senderType: "bot" as const,
      sourceId: null,
      text: messageText,
      contentAttributes: {
        metadata,
        ...(quickReplies && quickReplies.length > 0
          ? {
              type: "template" as const,
              payload: {
                templateType: "button" as const,
                buttons: quickReplies,
              },
            }
          : {}),
      },
      createdAt: new Date(),
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

    const trackingInvalidation = await db.transaction(async (tx) => {
      const invalidation =
        await contactInboxService.recordOutboundMessageCreated({
          tx,
          contactInboxId: contactInbox.id,
          contactId: contactInbox.contactId,
          workspaceId: conversation.workspaceId,
          at: message.createdAt,
        })

      await tx
        .update(conversationModel)
        .set({ lastActivityAt: message.createdAt })
        .where(eq(conversationModel.id, conversation.id))

      return invalidation
    })
    if (trackingInvalidation) {
      await contactInboxService.invalidateTracking(trackingInvalidation)
    }

    const promises: Promise<unknown>[] = [
      broadcastToWorkspaceParty(conversation.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
      sendMessageToChannel({
        conversation,
        contactInbox,
        message,
        quickReplies,
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
