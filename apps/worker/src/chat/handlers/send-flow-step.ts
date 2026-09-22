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
import { wrapOpenLinkUrl } from "@chatbotx.io/business/open-link"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
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
import type { messageModel } from "@chatbotx.io/database/schema"
import type {
  AttachmentModel,
  ContactInboxModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import { signAppointmentWebviewToken } from "@chatbotx.io/encryption"
import { emit } from "@chatbotx.io/event-bus"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem"
import type { MetadataPayload, StepType } from "@chatbotx.io/flow-config"
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
import { logDiagnostic } from "@chatbotx.io/logger"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import {
  IntegrationException,
  type MessageButtonTemplate,
  type MessageCardTemplate,
  parseSdkError,
  type SendFlowStepData,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { resolveStackFrames } from "@chatbotx.io/utils/error-log"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"
import type {
  ChatJobSendChatMessage,
  ChatJobSendFlowStep,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import {
  settleCommentAutomationDelivered,
  settleCommentAutomationFailure,
} from "../../lib/comment-automation-anchor"
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
  stepTypes.enum.sendMultipleImages,
  stepTypes.enum.sendQuickReply,
  stepTypes.enum.sendText,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendWaTemplateMessage,
  stepTypes.enum.whatsappCallButton,
  stepTypes.enum.whatsappFlow,
  stepTypes.enum.whatsappOptionList,
])

/**
 * Steps whose payload only exists on one channel. On any other channel they
 * are skipped before a Message row is persisted, so an omnichannel flow never
 * shows a phantom "sent" message the channel could not deliver.
 */
const CHANNEL_EXCLUSIVE_STEP_TYPES: Partial<
  Record<StepType, ContactInboxModel["channel"]>
> = {
  [stepTypes.enum.whatsappCallButton]: channelTypes.enum.whatsapp,
}

const isBlankTextCarrierStep = (step: SendFlowStepData) => {
  if (
    step.stepType === stepTypes.enum.sendText ||
    step.stepType === stepTypes.enum.whatsappCallButton
  ) {
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
  workspaceId,
  contactId,
  contactInboxId,
}: {
  workspaceId: string
  contactId: string
  contactInboxId?: string
}) => {
  if (contactInboxId) {
    return contactInboxService.findByUncached({
      where: { id: contactInboxId, contactId },
    })
  }

  return contactInboxService.findRecentByContactId({ workspaceId, contactId })
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
  // Read the same way as the two above, and — critically — the same way each
  // integration's own encoder reads it. The channel re-encodes the payload the
  // contact actually taps, so any attribution that lives only here is invisible
  // to the click. See `send-button.ts` in messenger/instagram{,-facebook}.
  const commentAutomationId = extractMetadata("commentAutomationId", metadata)

  return buttons.map((button) => {
    const buttonPayload = encodeButtonPayload({
      flowId,
      flowVersionId,
      buttonId: button.id,
      broadcastId,
      sequenceStepId,
      contactInboxId,
      commentAutomationId,
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

/**
 * Route an `openWebsite` button's destination through the `/go` interstitial.
 *
 * Messenger's `web_url` button always opens Meta's in-app webview, which cannot
 * follow the custom-scheme handoff a link like `https://zalo.me/g/<id>` relies
 * on — the contact just gets a blank page. The interstitial carries App Links
 * meta tags so the button launches the native app instead, and falls back to a
 * single tappable button when it doesn't. `wrapOpenLinkUrl` decides what is
 * exempt (our own origin, unresolved variables, an app's own channel).
 *
 * Applied at step level, mirroring `signBookingLinksInStep` directly above, and
 * for the same reason: every channel encoder and `convertButtonsToTemplate`
 * both read the step this returns, so the wire payload and the persisted
 * `Message` row cannot drift apart.
 */
const wrapOpenLinkButtonIfNeeded = (props: {
  workspaceId: string
  appUrl: string
  channel: string
  button: ButtonStepProps
}): ButtonStepProps => {
  const { button } = props
  if (button.buttonType !== buttonTypes.enum.openWebsite) {
    return button
  }

  const url = wrapOpenLinkUrl({
    appUrl: props.appUrl,
    workspaceId: props.workspaceId,
    url: button.beforeStep.url,
    channel: props.channel,
  })

  if (url === button.beforeStep.url) {
    return button
  }

  return { ...button, beforeStep: { ...button.beforeStep, url } }
}

const wrapOpenLinkButtonsIfNeeded = (props: {
  workspaceId: string
  appUrl: string
  channel: string
  buttons?: ButtonStepProps[]
}) => {
  if (!props.buttons?.length) {
    return props.buttons
  }
  return props.buttons.map((button) =>
    wrapOpenLinkButtonIfNeeded({ ...props, button }),
  )
}

const wrapOpenLinksInStep = (props: {
  workspaceId: string
  appUrl: string
  channel: string
  step: SendFlowStepData
}): SendFlowStepData => {
  let step = props.step
  if ("buttons" in step && step.buttons.length > 0) {
    const buttons = wrapOpenLinkButtonsIfNeeded({
      ...props,
      buttons: step.buttons,
    })
    step = { ...step, buttons: buttons ?? [] } as SendFlowStepData
  }
  if (!("cards" in step) || step.cards.length === 0) {
    return step
  }
  const cards = step.cards.map((card) => {
    if (!("buttons" in card) || card.buttons.length === 0) {
      return card
    }
    const buttons = wrapOpenLinkButtonsIfNeeded({
      ...props,
      buttons: card.buttons,
    })
    return { ...card, buttons: buttons ?? [] } as SendCardStepSchema
  })
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
  const conversation = await conversationService.findByIdWithContactUnscoped({
    id: conversationId,
  })
  if (!conversation) {
    return
  }

  const targetContactInbox = await findTargetContactInbox({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    contactInboxId,
  })
  if (!targetContactInbox) {
    return
  }

  // What the job actually carried. `metadata` is the carrier the button
  // encoders read; `commentAnchor` only decides delivery. Note the resolved
  // inbox may differ from the job's `contactInboxId` (see findTargetContactInbox)
  // — and it is the RESOLVED one that gets encoded into button payloads.
  logDiagnostic(
    logger,
    () => ({
      conversationId,
      jobContactInboxId: contactInboxId ?? null,
      resolvedContactInboxId: targetContactInbox.id,
      channel: targetContactInbox.channel,
      flowId,
      stepType: step.stepType,
      metadata: metadata ?? null,
      commentAnchor: commentAnchor ?? null,
    }),
    "sendFlowStep: job received",
  )

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

  const exclusiveChannel = CHANNEL_EXCLUSIVE_STEP_TYPES[step.stepType]
  if (exclusiveChannel && targetContactInbox.channel !== exclusiveChannel) {
    logger.debug(
      {
        conversationId,
        stepId: step.id,
        stepType: step.stepType,
        channel: targetContactInbox.channel,
      },
      "Skipping channel-exclusive flow step on another channel",
    )
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
      sourceId: targetContactInbox.sourceId,
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

  // Spintax is on here because only CHANNEL_DELIVERABLE_STEP_TYPES reach this
  // point — every string leaf is copy an author wrote for a contact to read.
  // Code- or data-carrying steps (external request, execute JavaScript) resolve
  // through their own handlers and deliberately leave it off.
  const resolvedStep = await resolveContactVariablesDeep(
    conversation.contactId,
    step,
    {
      contactInbox: targetContactInbox,
      conversation,
      ...(appointmentId ? { appointmentId } : {}),
    },
    { spintax: true },
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
    resolvedStep.stepType === stepTypes.enum.sendText ||
    resolvedStep.stepType === stepTypes.enum.whatsappCallButton
      ? resolvedStep.text
      : null

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

    // Runs after the booking signing, not before: the `/booking/picker` URL
    // that step just minted is same-origin and therefore exempt here, which is
    // what keeps its Messenger Extensions webview intact.
    const openLinkProps = {
      workspaceId: conversation.workspaceId,
      appUrl,
      channel: targetContactInbox.channel,
    }
    const stepForSend = wrapOpenLinksInStep({
      ...openLinkProps,
      step: stepWithSignedBookingLinks,
    })
    const quickRepliesForSend = wrapOpenLinkButtonsIfNeeded({
      ...openLinkProps,
      buttons: quickRepliesWithSignedBookingLinks,
    })

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
      quickRepliesForSend && quickRepliesForSend.length > 0
        ? convertButtonsToTemplate({
            flowId,
            flowVersionId,
            buttons: quickRepliesForSend,
            metadata,
            contactInboxId: targetContactInbox.id,
          })
        : undefined

    const canonicalStepButtons =
      "buttons" in stepForSend && stepForSend.buttons.length > 0
        ? convertButtonsToTemplate({
            flowId,
            flowVersionId,
            buttons: stepForSend.buttons,
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
    if ("cards" in stepForSend && stepForSend.cards.length > 0) {
      contentAttributes = {
        type: "template",
        payload: {
          templateType: "carousel",
          cards: convertCardsToTemplate({
            flowId,
            flowVersionId,
            cards: stepForSend.cards,
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

    // The comment-automation anchor, stamped in exactly the shape
    // `readCommentAutomationAnchor` expects (`lib/comment-automation-anchor.ts`)
    // so a `flow` reply reports delivery and failures through the same path a
    // `text` reply already does. `replyToCommentId` is part of that shape, so
    // the private branch has to set it too — the public branch already did,
    // above, for its own routing reasons.
    if (commentAnchor?.automationId) {
      contentAttributes = {
        ...contentAttributes,
        replyToCommentId: commentAnchor.commentId,
        commentAutomation: {
          automationId: commentAnchor.automationId,
          replyChannel: commentAnchor.replyChannel,
        },
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

    // Upload file(s) if any
    const attachmentInputs: Parameters<
      typeof repository.createWithAttachments
    >[1][0][] = []
    if ("url" in stepForSend) {
      const uploadedFile = await uploadFileFromUrl(
        stepForSend.url,
        `public/space/${conversation.workspaceId}/conversations/${conversation.id}/${createId()}`,
      )
      attachmentInputs.push({
        ...uploadedFile,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      })
    } else if ("images" in stepForSend) {
      for (const image of stepForSend.images) {
        const uploadedFile = await uploadFileFromUrl(
          image.url,
          `public/space/${conversation.workspaceId}/conversations/${conversation.id}/${createId()}`,
        )
        attachmentInputs.push({
          ...uploadedFile,
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
        })
      }
    }

    message = attachmentInputs.length
      ? await repository.createWithAttachments(messageInput, attachmentInputs)
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
    const trackingInvalidation =
      await conversationService.recordOutboundFlowStep({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: targetContactInbox.id,
        contactId: targetContactInbox.contactId,
        at: createdMessage.createdAt,
        lastStep: conversation.currentStep,
        currentStep: resolvedStep.id,
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
      ? sendMessageToChannel(
          {
            conversation,
            contactInbox: targetContactInbox,
            message,
            quickReplies: canonicalQuickReplies,
            metadata,
            sendFrom,
          },
          0,
          // A rethrow from here lands in this function's own catch, which
          // emits its own `message:failed` for the same send. Without this the
          // failure would be recorded twice.
          true,
        )
      : sendFlowStepToChannel({
          conversation,
          contactInbox: targetContactInbox,
          flowId,
          flowVersionId,
          step: stepForSend,
          metadata,
          richResponse,
          quickReplies: canonicalQuickReplies,
          messageId: message?.id,
          messageCreatedAt: message?.createdAt,
          sendFrom,
          // Comment-anchored private replies are supported on Messenger and
          // Instagram (both variants collapse to the "instagram" channel),
          // which share Meta's comment_id-anchored Send API — defensive
          // re-check in case a resolved contactInboxId ever points at a
          // different channel than the job intended. A "public" anchor never
          // reaches this branch (routed to sendMessageToChannel above
          // instead).
          commentAnchor:
            (targetContactInbox.channel === channelTypes.enum.messenger ||
              targetContactInbox.channel === channelTypes.enum.instagram) &&
            commentAnchor?.replyChannel === "private"
              ? commentAnchor
              : undefined,
          botSentAnalytics: {
            triggerHandler: "sendFlowStep",
            triggerType: "message_bot_sent_flow",
          },
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

    // A `flow` comment reply reports delivery the same way a `text` one does.
    // Only the first message of the run can settle it — `markDelivered` is
    // gated on `deliveredAt IS NULL`, so the rest of the flow's steps are
    // no-ops rather than inflating the count.
    await settleCommentAutomationDelivered({
      contentAttributes: message.contentAttributes,
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
      // Captured here while the throw is still in hand: `errorData` is a
      // stackless `ParsedError`, so `ErrorLog.stackTrace` has no other source.
      errorStack: resolveStackFrames(error),
      occurredAt: new Date(),
      // Always terminal: this catch swallows the error rather than rethrowing,
      // so the step's BullMQ job completes and nothing re-attempts the send.
      willRetry: false,
    })

    await recordMessageSendError(
      message?.id,
      undefined,
      conversation.workspaceId,
      message?.createdAt,
      parsedError.message,
    )

    // Always terminal here, for the same reason the `message:failed` emit above
    // says so: this catch swallows the error, so nothing will re-attempt the
    // send and flipping the automation's event to `failed` cannot be premature.
    await settleCommentAutomationFailure({
      contentAttributes: message?.contentAttributes,
      errorDetail: parsedError.message,
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
  // Forwarded from the chat worker: this function rethrows, so a BullMQ attempt
  // still in hand means another `message:failed` is coming for the same send.
  willRetryOnThrow = false,
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
    (await contactInboxService.findRecentByContactId({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
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

    const trackingInvalidation =
      await conversationService.recordOutboundMessageActivity({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        contactId: contactInbox.contactId,
        at: message.createdAt,
      })
    if (trackingInvalidation) {
      await contactInboxService.invalidateTracking(trackingInvalidation)
    }

    const promises: Promise<unknown>[] = [
      broadcastToWorkspaceParty(conversation.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
      sendMessageToChannel(
        {
          conversation,
          contactInbox,
          message,
          quickReplies,
          metadata,
        },
        0,
        willRetryOnThrow,
      ),
    ]

    await Promise.all(promises)

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
