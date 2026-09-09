import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  appointmentService,
  broadcastToWorkspaceParty,
  buildContext,
  type ContactInboxTrackingData,
  contactInboxService,
  contactService,
  conversationService,
  hasOnDemandProfileApi,
  messageCleanupService,
  quotaEnforcementService,
  recordProfileRefreshFailure,
  resolveTenantSettings,
  updateContactFromMessage,
  workspaceService,
} from "@chatbotx.io/business"
import { resolveLastUserInputTracking } from "@chatbotx.io/business/contact-inbox"
import {
  finalizeContactProfile,
  normalizeLanguage,
} from "@chatbotx.io/business/contact-locale"
import { isUniqueViolationError } from "@chatbotx.io/database/client"
import {
  type ChannelType,
  type ContactSource,
  contactSources,
  type IntegrationType,
} from "@chatbotx.io/database/partials"
import {
  contactInboxRepository,
  createMessageRepository,
} from "@chatbotx.io/database/repositories"
import {
  CONTACT_INBOX_SOURCE_ID_KEY,
  CONTACT_INBOX_SOURCE_USER_ID_KEY,
  contactInboxModel,
  contactModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  InboxModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import {
  parseAppointmentCancelPostback,
  verifyAppointmentCancelPostback,
} from "@chatbotx.io/encryption"
import { emit } from "@chatbotx.io/event-bus"
import {
  emitContactCreated,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import type { IncomingAttachment } from "@chatbotx.io/sdk"
import {
  type AuthValue,
  contentTypes,
  getStoryReply,
  type IncomingContact,
  type IncomingMessage,
  isSourceUserIdKeyedIdentity,
  type MessageLocationEntity,
  type MessageWhatsappFlowResponseEntity,
  messageTypes,
  type ReceivedMessageResult,
  resolveWithSourceUserIdFallback,
  SdkException,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  type IntegrationJobDeleteIncomingComment,
  type IntegrationJobDeleteIncomingMessage,
  type IntegrationJobMessageReaction,
  type IntegrationJobReceiveComment,
  type IntegrationJobReceiveMessage,
  type IntegrationJobUpdateIncomingComment,
  integrationQueue,
  NotificationJobAction,
  notificationQueue,
} from "@chatbotx.io/worker-config"
import { UnrecoverableError } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import {
  allIntegrations,
  integrationService,
  isInstagramViaFacebook,
} from "../../services/integrations"
import {
  getProfileRefreshSource,
  isInboundConversationMessage,
  refreshExistingContactProfile,
} from "./contact-profile-refresh"
import { resolvePostbackButtonLabel, sanitizeFlowAction } from "./flow-action"

type ContactInboxTracking = ContactInboxTrackingData

type ContactLocation = {
  latitude: number
  longitude: number
}

type ReceivedMessageSystemFieldUpdates = {
  contactInboxTracking: ContactInboxTracking
  contactLocation: ContactLocation | null
}

const correctStoryReplyDirectionForNewContact = (
  message: IncomingMessage | null,
  isNewContact: boolean,
): IncomingMessage | null => {
  const storyReply = getStoryReply(message?.contentAttributes)
  if (
    message &&
    isNewContact &&
    message.messageType === messageTypes.enum.outgoing &&
    storyReply
  ) {
    return { ...message, messageType: messageTypes.enum.incoming }
  }
  return message
}

const APPOINTMENT_CANCEL_FEEDBACK_COPY = {
  en: {
    unavailable:
      "This cancellation link has expired or is no longer available.",
    workspaceInactive:
      "This appointment cannot be cancelled because the workspace is currently inactive.",
  },
  vi: {
    unavailable: "Liên kết hủy lịch đã hết hạn hoặc không còn khả dụng.",
    workspaceInactive: "Không thể hủy lịch vì workspace đang tạm ngưng.",
  },
} as const

type AppointmentCancelFeedbackReason =
  keyof (typeof APPOINTMENT_CANCEL_FEEDBACK_COPY)["en"]

const resolveAppointmentCancelFeedbackText = ({
  reason,
  contactInbox,
  incomingContact,
}: {
  reason: AppointmentCancelFeedbackReason
  contactInbox: ContactInboxModel
  incomingContact: IncomingContact
}) => {
  const language =
    normalizeLanguage(contactInbox.language) ??
    normalizeLanguage(incomingContact.language) ??
    normalizeLanguage(incomingContact.locale) ??
    "en"

  const supportedLanguage: keyof typeof APPOINTMENT_CANCEL_FEEDBACK_COPY =
    language === "vi" ? language : "en"

  return APPOINTMENT_CANCEL_FEEDBACK_COPY[supportedLanguage][reason]
}

export const metaReferralToContactSource = (
  raw?: string | null,
): ContactSource | undefined => {
  switch (raw) {
    case "ADS":
      return contactSources.enum.ads
    case "SHORTLINK":
      return contactSources.enum.botLink
    case "CUSTOMER_CHAT_PLUGIN":
      return contactSources.enum.chatPlugin
    default:
      return
  }
}

export const receiveMessage = async (
  props: IntegrationJobReceiveMessage["data"],
): Promise<{
  message: (MessageModel & { attachments: unknown[] }) | null
  conversation: ConversationModel
  postbackAction: string | null
  templateFlowToken: string | null
  quickReplyAction: string | null
  ref?: string | null
  channelType: "instagram" | "instagramFacebook"
}> => {
  setWebhookExecutionContext({ source: "webhook" })

  const { integrationType, integrationIdentifier } = props

  if (!Object.hasOwn(allIntegrations, integrationType)) {
    throw new Error(`Unsupported integration: ${integrationType}`)
  }

  const dbIntegration =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )
  const { inbox, integrationRow } = dbIntegration
  let integration = allIntegrations[integrationType]
  if (!integration) {
    throw new SdkException(
      `No integration registered for channel: ${integrationType}`,
    )
  }
  const isFacebookConnectedInstagram =
    integrationType === "instagram" && isInstagramViaFacebook(integrationRow)
  if (isFacebookConnectedInstagram) {
    integration = allIntegrations.instagramFacebook ?? integration
  }
  const channelType: "instagram" | "instagramFacebook" =
    isFacebookConnectedInstagram ? "instagramFacebook" : "instagram"

  const workspace = await workspaceService.findById({ id: inbox.workspaceId })
  const isWorkspaceActive = workspaceService.isActiveNow(workspace)

  const { storageUrl } = await resolveTenantSettings({
    workspaceId: inbox.workspaceId,
  })
  const ctx = await buildContext({
    workspaceId: inbox.workspaceId,
    integrationType,
    integration: integrationRow,
  })

  const parsedMessage = await integration.runChannelHandler(
    "message",
    "receiveMessage",
    { ctx, data: props },
  )
  if (!parsedMessage) {
    throw new SdkException("Unable to parse received message")
  }

  const {
    message: rawIncomingMessage,
    contact: incomingContact,
    postbackAction: rawPostbackAction,
    templateFlowToken,
    quickReplyAction: rawQuickReplyAction,
    ref,
    referralSource,
  } = parsedMessage
  const appointmentCancelToken =
    parseAppointmentCancelPostback(rawPostbackAction)
  let postbackAction = sanitizeFlowAction(rawPostbackAction, {
    kind: "postback",
    integrationType,
    integrationIdentifier,
  })
  const quickReplyAction = sanitizeFlowAction(rawQuickReplyAction, {
    kind: "quickReply",
    integrationType,
    integrationIdentifier,
  })

  // Label resolution only reads the raw text (direction correction never
  // changes it) and the workspace, so it can overlap the contact lookup.
  const [detected, postbackButtonLabel] = await Promise.all([
    detectContactAndConversation({
      incomingContact,
      inbox,
      integrationRow,
      source:
        metaReferralToContactSource(referralSource) ??
        contactSources.enum.inboundMessage,
    }),
    resolvePostbackButtonLabel({
      postbackAction,
      buttonTitle: parsedMessage.buttonTitle,
      message: rawIncomingMessage,
      workspaceId: inbox.workspaceId,
    }),
  ])
  if (!detected) {
    throw new SdkException("Unable to resolve contact and conversation")
  }
  const { contactInbox, conversation, contact, isNewContact } = detected
  const directedIncomingMessage = correctStoryReplyDirectionForNewContact(
    rawIncomingMessage,
    isNewContact,
  )
  const incomingMessage =
    postbackButtonLabel && directedIncomingMessage
      ? { ...directedIncomingMessage, text: postbackButtonLabel }
      : directedIncomingMessage
  const systemFieldUpdates = getReceivedMessageSystemFieldUpdates({
    buttonTitle: parsedMessage.buttonTitle || postbackButtonLabel,
    message: incomingMessage,
    referral: parsedMessage.referral,
  })

  // Overwrite Contact.phoneNumber/email from message text — every inbound
  // channel. Unconditional: the customer just typed the value, so it's
  // treated as fresher truth than any prior column value.
  //
  // Guarded on messageType !== 'outgoing' so bot/agent-authored text never
  // feeds the libphonenumber extractor (would otherwise false-positive on
  // long order/ticket IDs in templated outbound messages).
  if (incomingMessage?.text && incomingMessage.messageType !== "outgoing") {
    try {
      await updateContactFromMessage({
        contactId: contactInbox.contactId,
        workspaceId: inbox.workspaceId,
        text: incomingMessage.text,
      })
    } catch (error) {
      logger.warn(
        { error, contactId: contactInbox.contactId, channel: inbox.channel },
        "Contact update from message text failed",
      )
    }
  }

  if (incomingMessage && incomingMessage.messageType !== "outgoing") {
    try {
      await contactService.unblockIfBlocked(
        { workspaceId: inbox.workspaceId, id: contactInbox.contactId },
        contact,
      )
    } catch (error) {
      logger.warn(
        { error, contactId: contactInbox.contactId, channel: inbox.channel },
        "Auto-unblock on inbound message failed",
      )
    }
  }

  let createdMessage: (MessageModel & { attachments: unknown[] }) | null = null
  if (incomingMessage) {
    const { message: newMessage, isNew: isNewMessage } =
      await saveAndBroadcastMessage({
        inbox,
        contactInbox,
        conversation,
        incomingMessage,
        storageUrl,
        ...systemFieldUpdates,
      })

    // Best-effort backfill of a nameless existing contact's profile. No
    // isNewMessage/isNewContact gate; awaited before the flow-action enqueue
    // below so the first automated reply already sees `{{first_name}}`.
    const profileRefreshSource = getProfileRefreshSource({
      channel: inbox.channel as ChannelType,
      incomingMessage,
      contact,
    })
    if (profileRefreshSource) {
      await refreshExistingContactProfile({
        source: profileRefreshSource,
        inbox,
        contactInbox,
        incomingContact,
        contactId: contact.id,
      })
    }

    if (isNewMessage) {
      createdMessage = newMessage

      if (appointmentCancelToken) {
        try {
          const payload = await verifyAppointmentCancelPostback(
            rawPostbackAction ?? "",
          )
          postbackAction = null

          if (isWorkspaceActive) {
            const result =
              await appointmentService.cancelAppointmentByToken(payload)
            if (!result.cancellable) {
              await sendAppointmentCancelFeedback({
                conversation,
                contactInbox,
                text: resolveAppointmentCancelFeedbackText({
                  reason: "unavailable",
                  contactInbox,
                  incomingContact,
                }),
              })
            }
          } else {
            await sendAppointmentCancelFeedback({
              conversation,
              contactInbox,
              text: resolveAppointmentCancelFeedbackText({
                reason: "workspaceInactive",
                contactInbox,
                incomingContact,
              }),
            })
          }
        } catch (error) {
          logger.warn(
            {
              error: normalizeError(error),
              conversationId: conversation.id,
              contactInboxId: contactInbox.id,
            },
            "Appointment cancel postback failed",
          )
          await sendAppointmentCancelFeedback({
            conversation,
            contactInbox,
            text: resolveAppointmentCancelFeedbackText({
              reason: "unavailable",
              contactInbox,
              incomingContact,
            }),
          })
        }
      }

      if (postbackAction && isWorkspaceActive) {
        await automatedResponseService.enqueueFlowAction({
          kind: "postback",
          data: {
            conversationId: conversation,
            contactInboxId: contactInbox,
            action: postbackAction,
            ref,
            messageId: createdMessage?.id,
            payload: {
              waFlowResponse:
                (
                  incomingMessage.contentAttributes as MessageWhatsappFlowResponseEntity
                )?.flowResponse || "",
            },
          },
        })
      }

      if (quickReplyAction && isWorkspaceActive) {
        await automatedResponseService.enqueueFlowAction({
          kind: "quickReply",
          data: {
            conversationId: conversation,
            contactInboxId: contactInbox,
            action: quickReplyAction,
            ref,
            messageId: createdMessage?.id,
          },
        })
      }

      if (templateFlowToken && isWorkspaceActive) {
        const flowResponse = getWhatsappFlowResponse(incomingMessage)
        if (flowResponse) {
          await integrationQueue.add(
            IntegrationJobAction.captureTemplateFlowResponse,
            {
              type: IntegrationJobAction.captureTemplateFlowResponse,
              data: {
                workspaceId: conversation.workspaceId,
                conversationId: conversation,
                contactInboxId: contactInbox,
                messageId: createdMessage.id,
                templateFlowToken,
                flowResponse,
              },
            },
            { jobId: `template-flow-response-${createdMessage.id}` },
          )
        }
      }

      // Message echoes (agent replying from the channel's own native UI,
      // e.g. Meta Business Suite, rather than the ChatbotX inbox) never go
      // through `create-message.action.ts`, so "Page" keyword automation
      // must be checked here too — mirrors the enqueue in that action,
      // including its `user &&` gate (see isEchoOfOwnSend).
      if (
        isWorkspaceActive &&
        incomingMessage.messageType === "outgoing" &&
        incomingMessage.text
      ) {
        try {
          if (
            !(await isEchoOfOwnSend({ conversation, message: createdMessage }))
          ) {
            await chatQueue.add(ChatJobAction.checkOutboundAutomatedResponse, {
              type: ChatJobAction.checkOutboundAutomatedResponse,
              data: {
                conversation,
                contactInbox,
                message: { id: createdMessage.id, text: incomingMessage.text },
              },
            })
          }
        } catch (error) {
          // Deliberately fail closed: a failed self-send check must not let a
          // bot echo through, or an outbound rule can match its own reply.
          logger.warn(
            {
              err: normalizeError(error),
              conversationId: conversation.id,
              contactInboxId: contactInbox.id,
            },
            "Skipped outbound automated response check after an error",
          )
        }
      }
    }
  }

  // Referral-only events (no message/postback attached — e.g. a
  // `messaging_referrals` webhook on an existing thread) never reach the
  // `if (incomingMessage)` branch above, so `ContactInbox.referral` would
  // otherwise never get persisted for them. `updateTracking` merges the
  // referral jsonb via COALESCE and self-invalidates the tracking cache
  // since no `tx` is passed here. Deliberately does not touch
  // `firstInteractionAt` (last-touch attribution, not a conversation reset).
  // Intentionally left uncaught: a transient failure here must fail the
  // BullMQ job so it retries, otherwise CTM/CTID attribution is silently
  // lost forever and `runRef` below would run without the persisted
  // referral. The jsonb merge is idempotent, so a retry is safe.
  if (!incomingMessage && parsedMessage.referral) {
    await contactInboxService.updateTracking({
      contactInboxId: contactInbox.id,
      contactId: contactInbox.contactId,
      workspaceId: inbox.workspaceId,
      data: { referral: parsedMessage.referral },
    })
  }

  if (ref && isWorkspaceActive) {
    await integrationQueue.add(IntegrationJobAction.runRef, {
      type: IntegrationJobAction.runRef,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        ref,
        messageId: createdMessage?.id,
        isNewContact,
      },
    })
  }

  return {
    message: createdMessage,
    conversation,
    postbackAction,
    templateFlowToken: templateFlowToken ?? null,
    quickReplyAction,
    ref,
    channelType,
  }
}

const getReceivedMessageSystemFieldUpdates = (
  parsedMessage: Pick<
    ReceivedMessageResult,
    "buttonTitle" | "message" | "referral"
  >,
): ReceivedMessageSystemFieldUpdates => ({
  contactInboxTracking: getReceivedMessageContactInboxTracking(parsedMessage),
  contactLocation: parseIncomingLocation(parsedMessage.message),
})

const getWhatsappFlowResponse = (
  message: IncomingMessage,
): Record<string, unknown> | null => {
  const entity = message.contentAttributes as
    | MessageWhatsappFlowResponseEntity
    | undefined
  return entity?.type === "whatsapp_flow_response" &&
    entity.flowResponse &&
    typeof entity.flowResponse === "object"
    ? entity.flowResponse
    : null
}

const getReceivedMessageContactInboxTracking = (
  parsedMessage: Pick<ReceivedMessageResult, "buttonTitle" | "referral">,
): ContactInboxTracking => {
  const tracking: ContactInboxTracking = {}

  if (parsedMessage.referral) {
    tracking.referral = parsedMessage.referral
  }

  if (parsedMessage.buttonTitle) {
    tracking.lastBtnTitle = parsedMessage.buttonTitle
  }

  return tracking
}

const parseIncomingLocation = (
  message?: IncomingMessage | null,
): ContactLocation | null => {
  if (!message) {
    return null
  }

  if (message.messageType === messageTypes.enum.outgoing) {
    return null
  }

  if (message.contentType !== contentTypes.enum.location) {
    return null
  }

  const location = message.contentAttributes as
    | (MessageLocationEntity & {
        lat?: unknown
        long?: unknown
      })
    | undefined
  const latitude = Number(location?.latitude ?? location?.lat)
  const longitude = Number(location?.longitude ?? location?.long)
  if (!(Number.isFinite(latitude) && Number.isFinite(longitude))) {
    return null
  }

  return { latitude, longitude }
}

async function sendAppointmentCancelFeedback(input: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  text: string
}) {
  try {
    await chatQueue.add(ChatJobAction.sendChatMessage, {
      type: ChatJobAction.sendChatMessage,
      data: {
        conversation: input.conversation,
        contactInbox: input.contactInbox,
        text: input.text,
      },
    })
  } catch (error) {
    logger.warn(
      {
        err: normalizeError(error),
        conversationId: input.conversation.id,
        contactInboxId: input.contactInbox.id,
        action: "sendAppointmentCancelFeedback",
      },
      "Failed to send appointment cancel feedback",
    )
  }
}

/**
 * How far back to look for the ChatbotX-side row an echo may be duplicating.
 * The race it covers is sub-second — `updateSourceId` runs right after the
 * channel send returns — so this only needs to be generous, not wide: a
 * longer window would start suppressing genuine agent replies that happen to
 * repeat something the bot said.
 */
const SELF_SENT_ECHO_WINDOW_MS = 2 * 60 * 1000

/** Outgoing rows to compare against — enough to cover a multi-message reply. */
const SELF_SENT_ECHO_LOOKBACK = 10

/**
 * Mirrors the `user &&` gate on the inbox call site
 * (`apps/builder/src/features/messages/actions/create-message.action.ts`):
 * only a message a human agent actually typed may trigger "Page" keyword
 * automation.
 *
 * Echoes are stamped `senderType: "user"` whatever their origin, so a bot send
 * is otherwise indistinguishable from an agent one. Normally the echo is
 * deduped by `sourceId` and never reaches this code, but `updateSourceId`
 * only runs after the channel send returns (`chat/handlers/send-message.ts`)
 * and swallows its errors, so a fast webhook can insert a second row first. On
 * such a miss the bot would run keyword automation over its own text — and,
 * because an outbound rule replies through the same channel, that reply echoes
 * back and can match itself in a loop.
 *
 * Every ChatbotX send persists its Message row *before* hitting the channel,
 * so a recent outgoing row carrying the same text is our own send, not an
 * agent's.
 */
const isEchoOfOwnSend = async (props: {
  conversation: ConversationModel
  message: MessageModel
}): Promise<boolean> => {
  const { conversation, message } = props
  const repository = await createMessageRepository()
  const recentOutgoing = await repository.findLastByConversation(
    conversation.id,
    {
      limit: SELF_SENT_ECHO_LOOKBACK,
      messageTypes: ["outgoing"],
      sinceTime: new Date(Date.now() - SELF_SENT_ECHO_WINDOW_MS),
      workspaceId: conversation.workspaceId,
    },
  )

  return recentOutgoing.some(
    (candidate) =>
      candidate.id !== message.id && candidate.text === message.text,
  )
}

// Creates or updates the message row (deduplicates webhook retries via sourceId),
// updates contactInbox/conversation activity timestamps for new rows,
// broadcasts the realtime event to the UI, and emits `message:received` to trigger flows.
// Shared by `receiveMessage` and `receiveComment`.
const saveAndBroadcastMessage = async (props: {
  inbox: InboxModel
  contactInbox: ContactInboxModel
  conversation: ConversationModel
  incomingMessage: IncomingMessage
  contactInboxTracking?: ContactInboxTracking
  contactLocation?: ContactLocation | null
  createdAt?: Date
  storageUrl: string
}): Promise<{
  message: MessageModel & { attachments: unknown[] }
  isNew: boolean
}> => {
  const {
    inbox,
    contactInbox,
    conversation,
    incomingMessage,
    contactInboxTracking,
    contactLocation,
    createdAt,
    storageUrl,
  } = props
  const repository = await createMessageRepository()

  // Computed from the pre-update `contactInbox` snapshot this function was
  // called with — before persistNewMessageSideEffects' updateTracking runs —
  // because ContactInbox.lastIncomingMessageAt/firstInteractionAt get set by
  // outbound sends too (see contact-inbox/service.ts) and can't be used to
  // infer "first inbound message" after the tracking update has landed.
  const isInboundMessage = incomingMessage.messageType !== "outgoing"
  const isFirstIncomingMessage =
    isInboundMessage && contactInbox.lastIncomingMessageAt === null

  const messageInput = {
    id: createId(),
    conversationId: conversation.id,
    contactInboxId: contactInbox.id,
    senderType:
      incomingMessage.messageType === "outgoing"
        ? ("user" as const)
        : ("contact" as const),
    workspaceId: inbox.workspaceId,
    sourceId: incomingMessage.sourceId,
    senderId:
      incomingMessage.messageType === "outgoing"
        ? null
        : contactInbox.contactId,
    messageType: incomingMessage.messageType,
    text: incomingMessage.text,
    contentType: incomingMessage.contentType,
    contentAttributes: incomingMessage.contentAttributes,
    type: incomingMessage.type ?? "message",
    parentId: incomingMessage.parentId ?? null,
    createdAt: createdAt ?? new Date(),
  }

  const attachmentInputs =
    incomingMessage.attachments?.map((attachment: IncomingAttachment) => ({
      ...attachment,
      workspaceId: inbox.workspaceId,
      conversationId: conversation.id,
    })) ?? []

  let messageWithAttachments: MessageModel & { attachments: unknown[] }
  let isNew: boolean

  if (attachmentInputs.length > 0) {
    const result = await repository.createOrUpdateWithAttachments(
      messageInput,
      attachmentInputs,
    )
    messageWithAttachments = result.result
    isNew = result.isNew
  } else {
    const result = await repository.createOrUpdate(messageInput)
    messageWithAttachments = { ...result.message, attachments: [] }
    isNew = result.isNew
  }

  const newMessage = messageWithAttachments

  if (isNew) {
    await persistNewMessageSideEffects({
      inbox,
      contactInbox,
      conversation,
      incomingMessage,
      message: newMessage,
      storageUrl,
      contactInboxTracking,
      contactLocation,
    })
  }

  try {
    broadcastToWorkspaceParty(inbox.workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: newMessage,
    })
  } catch (error) {
    logger.warn(error, "Unable to emit realtime message")
  }

  // Push notification for a genuinely new inbound message only — this
  // broadcast above is unconditional, so the guard here is built explicitly
  // rather than copied from it.
  if (isNew && isInboundMessage) {
    try {
      await notificationQueue.add(
        NotificationJobAction.notifyIncomingMessage,
        {
          type: NotificationJobAction.notifyIncomingMessage,
          data: {
            workspaceId: inbox.workspaceId,
            conversationId: conversation.id,
            messageId: newMessage.id,
            messageText: newMessage.text?.slice(0, 140),
            contentType: newMessage.contentType,
            attachmentCount: newMessage.attachments.length,
          },
        },
        { jobId: `notify-incoming-${newMessage.id}` },
      )
    } catch (error) {
      logger.warn(error, "Unable to enqueue incoming message notification")
    }
  }

  if (isNew) {
    emit(messageEventTypeSchema.enum["message:received"], {
      workspaceId: inbox.workspaceId,
      contactId: contactInbox.contactId,
      contactInboxId: contactInbox.id,
      channel: inbox.channel,
      inboxId: inbox.id,
      occurredAt: newMessage.createdAt,
      sourceId: newMessage.sourceId ?? undefined,
      origin: isInboundMessage ? "inbound" : undefined,
      messageId: newMessage.id,
      isFirstIncomingMessage,
    })
  }

  return { message: newMessage, isNew }
}

const persistNewMessageSideEffects = async (props: {
  inbox: InboxModel
  contactInbox: ContactInboxModel
  conversation: ConversationModel
  incomingMessage: IncomingMessage
  message: MessageModel
  storageUrl: string
  contactInboxTracking?: ContactInboxTracking
  contactLocation?: ContactLocation | null
}): Promise<void> => {
  const {
    inbox,
    contactInbox,
    conversation,
    incomingMessage,
    message,
    storageUrl,
    contactInboxTracking,
    contactLocation,
  } = props

  const trackingInvalidation = await conversationService.recordInboundActivity({
    workspaceId: inbox.workspaceId,
    conversationId: conversation.id,
    contactInboxId: contactInbox.id,
    contactId: contactInbox.contactId,
    tracking: {
      ...getMessageActivityTracking({ incomingMessage, message, storageUrl }),
      ...contactInboxTracking,
    },
    contactLocation,
    at: message.createdAt,
  })

  if (trackingInvalidation) {
    await contactInboxService.invalidateTracking(trackingInvalidation)
  }
}

const getMessageActivityTracking = (props: {
  incomingMessage: IncomingMessage
  message: MessageModel
  storageUrl: string
}): ContactInboxTracking => {
  const { incomingMessage, message, storageUrl } = props
  const tracking: ContactInboxTracking = {
    firstInteractionAt: message.createdAt,
    lastMessageAt: message.createdAt,
  }

  if (incomingMessage.type === "comment") {
    tracking.lastCommentMessageId = message.id
    tracking.lastCommentMessageAt = message.createdAt
  }

  if (isInboundConversationMessage(incomingMessage)) {
    tracking.lastIncomingMessageAt = message.createdAt
    Object.assign(
      tracking,
      resolveLastUserInputTracking({
        contentType: incomingMessage.contentType,
        text: incomingMessage.text,
        attachments: incomingMessage.attachments,
        storageUrl,
      }),
    )
  }

  return tracking
}

// Handles a Facebook fanpage comment (enqueued as `incomingComment` by the
// messenger webhook). Each post maps to one conversation keyed by
// `Conversation.sourceId = postId`; the comment author's PSID identifies the
// contact. Unlike `receiveMessage`, comments only land in the inbox — no
// automated-response/flow pipeline is triggered.
export const receiveComment = async (
  props: IntegrationJobReceiveComment["data"],
): Promise<void> => {
  setWebhookExecutionContext({ source: "webhook" })

  const { integrationType, integrationIdentifier, commentData } = props

  if (commentData.fromId === integrationIdentifier) {
    logger.info(
      { commentId: commentData.commentId, integrationIdentifier },
      "receiveComment: skipping self-authored comment",
    )
    return
  }

  const { inbox, integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )

  // `from.id` is the commenter's ID (PSID for Messenger, Instagram User ID for Instagram);
  // `fromName` is the fallback firstName.
  const incomingContact: IncomingContact = {
    sourceId: commentData.fromId,
    sourceConversationId: commentData.postId,
    firstName: commentData.fromName,
  }

  const detected = await detectContactAndConversation({
    incomingContact,
    inbox,
    integrationRow,
    source: contactSources.enum.comments,
  })
  if (!detected) {
    throw new SdkException("Unable to resolve contact and conversation")
  }
  const { contactInbox, conversation } = detected

  const repository = await createMessageRepository()
  let parentId: string | null = null
  if (commentData.parentId) {
    const parentMessage = await repository.findBySourceId(
      commentData.parentId,
      conversation.id,
      inbox.workspaceId,
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    )
    parentId = parentMessage?.id ?? null
  }

  let attachments: IncomingAttachment[] = []
  if (integrationType === "messenger") {
    const ctx = await buildContext({
      workspaceId: inbox.workspaceId,
      integrationType,
      integration: {
        ...integrationRow,
        auth: integrationRow.auth as MessengerAuthValue,
      },
    })
    const result = await allIntegrations.messenger
      ?.runAction("getCommentAttachment", {
        ctx,
        input: { commentId: commentData.commentId },
      })
      .catch(() => undefined)
    if (result?.attachment) {
      attachments = [result.attachment]
    }
  }

  const incomingMessage: IncomingMessage = {
    sourceId: commentData.commentId,
    messageType: messageTypes.enum.incoming,
    text: commentData.message,
    contentType: contentTypes.enum.text,
    type: "comment",
    parentId,
    attachments,
    // The commented post id lives on the comment message itself (not on the
    // ContactInbox); the `last_post_id`/`last_commented_post_text` system fields
    // read it back from here via the user's latest comment message.
    contentAttributes: { postId: commentData.postId },
  }

  const { storageUrl } = await resolveTenantSettings({
    workspaceId: inbox.workspaceId,
  })

  await saveAndBroadcastMessage({
    inbox,
    contactInbox,
    conversation,
    incomingMessage,
    storageUrl,
  })

  const workspace = await workspaceService.findById({ id: inbox.workspaceId })
  if (!workspaceService.isActiveNow(workspace)) {
    return
  }

  const processCommentAutomationJobId = `comment-auto-${commentData.commentId}`
  const existingJob = await integrationQueue.getJob(
    processCommentAutomationJobId,
  )
  if (existingJob && (await existingJob.isFailed())) {
    await existingJob.remove()
  }

  await integrationQueue.add(
    IntegrationJobAction.processCommentAutomation,
    {
      type: IntegrationJobAction.processCommentAutomation,
      data: {
        integrationType,
        integrationIdentifier,
        workspaceId: inbox.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        commentId: commentData.commentId,
        postId: commentData.postId,
        parentId: commentData.parentId,
        fromId: commentData.fromId,
        message: commentData.message,
        createdTime: commentData.createdTime,
      },
    },
    { jobId: processCommentAutomationJobId },
  )
}

// When a commenter edits their comment, sync the new text to the DB
// and broadcast the change to the inbox in real-time.
export const updateIncomingComment = async (
  props: IntegrationJobUpdateIncomingComment["data"],
): Promise<void> => {
  const { integrationType, integrationIdentifier, commentId, newText } = props

  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )

  const repository = await createMessageRepository()
  const updated = await repository.updateTextBySourceId(
    commentId,
    inbox.workspaceId,
    newText,
  )

  if (!updated) {
    logger.warn({ commentId }, "updateIncomingComment: comment not found")
    return
  }

  try {
    broadcastToWorkspaceParty(inbox.workspaceId, {
      eventType: RealtimeEventType.messageUpdated,
      data: {
        messageId: updated.id,
        newText,
        removedAttachment: false,
      },
    })
  } catch (error) {
    logger.warn(error, "updateIncomingComment: unable to broadcast")
  }
}

// When a commenter deletes their comment, soft-delete it (and any
// child comments) in the DB and broadcast the deletion to the inbox.
export const deleteIncomingComment = async (
  props: IntegrationJobDeleteIncomingComment["data"],
): Promise<void> => {
  const { integrationType, integrationIdentifier, commentId } = props

  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )

  const repository = await createMessageRepository()
  const deleted = await repository.deleteBySourceId(
    commentId,
    inbox.workspaceId,
    new Date(),
  )

  if (deleted.length === 0) {
    logger.warn({ commentId }, "deleteIncomingComment: comment not found")
    return
  }

  const messageIds = deleted.map((row) => row.id)
  try {
    broadcastToWorkspaceParty(inbox.workspaceId, {
      eventType: RealtimeEventType.messageDeleted,
      data: { messageIds },
    })
  } catch (error) {
    logger.warn(error, "deleteIncomingComment: unable to broadcast")
  }
}

// When a contact unsends a previously-sent DM, soft-delete it in the DB and
// broadcast the deletion to the inbox — mirrors deleteIncomingComment, keyed
// on the message's `mid` (already stored as Message.sourceId, see
// saveAndBroadcastMessage above).
export const deleteIncomingMessage = async (
  props: IntegrationJobDeleteIncomingMessage["data"],
): Promise<void> => {
  const { integrationType, integrationIdentifier, messageId } = props

  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )

  const repository = await createMessageRepository()
  const deleted = await repository.deleteBySourceId(
    messageId,
    inbox.workspaceId,
    new Date(),
  )

  if (deleted.length === 0) {
    logger.warn({ messageId }, "deleteIncomingMessage: message not found")
    return
  }

  const messageIds = deleted.map((row) => row.id)
  try {
    await broadcastToWorkspaceParty(inbox.workspaceId, {
      eventType: RealtimeEventType.messageDeleted,
      data: { messageIds },
    })
  } catch (error) {
    logger.warn(error, "deleteIncomingMessage: unable to broadcast")
  }
}

type ContactInboxWithContact = ContactInboxModel & { contact: ContactModel }

type ContactInboxResolverProps = {
  inbox: InboxModel
  incomingContact: IncomingContact
}

// Ordered identity lookup via the shared fallback contract: sourceId first
// (today's behavior, unchanged — a phone-keyed match never falls through),
// then the scoped user id (e.g. a WhatsApp BSUID) when the payload carries
// one. Both columns are backed by unique indexes on (inboxId, …).
const resolveExistingContactInbox = async ({
  inbox,
  incomingContact,
}: ContactInboxResolverProps): Promise<ContactInboxWithContact | undefined> =>
  await resolveWithSourceUserIdFallback(incomingContact, (where) =>
    contactInboxRepository.findWithContact({
      where: { inboxId: inbox.id, channel: inbox.channel, ...where },
    }),
  )

// When a contact reacts (or removes a reaction) to a DM, record it as an
// activity-type message in the conversation timeline. A reaction only ever
// happens within an existing conversation, so — unlike a real inbound
// message — a reaction from an unrecognized contact is skipped rather than
// creating a new contact, and never consumes MAC quota.
export const processMessageReaction = async (
  props: IntegrationJobMessageReaction["data"],
): Promise<void> => {
  const {
    integrationType,
    integrationIdentifier,
    messageId,
    action,
    emoji,
    contactSourceId,
  } = props

  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )

  const existingContactInbox = await resolveExistingContactInbox({
    inbox,
    incomingContact: { sourceId: contactSourceId },
  })
  if (!existingContactInbox) {
    logger.warn(
      { contactSourceId, messageId },
      "processMessageReaction: contact not found — skipping",
    )
    return
  }

  const conversation = await conversationService.findOrCreate({
    workspaceId: inbox.workspaceId,
    contactId: existingContactInbox.contactId,
    sourceId: null,
  })

  // Deliberately bypasses saveAndBroadcastMessage: that helper treats any
  // non-"outgoing" messageType as a genuine inbound message, which would
  // refresh ContactInbox.lastIncomingMessageAt (corrupting the messaging-window
  // check) and fire the unconditional message:received event that MAC billing
  // and ads-conversion listeners consume with no way to exclude an activity
  // row. A reaction only ever inserts/updates one lightweight activity
  // message — persist + broadcast, nothing else.
  const repository = await createMessageRepository()
  // Stable (no wall-clock component) so a BullMQ retry of this same job
  // upserts the same activity row instead of creating a duplicate. Must not
  // reuse the reacted-to message's mid: that would collide with
  // createOrUpdate's dedup-by-sourceId and corrupt the original message.
  const reactionSourceId = `${messageId}-reaction-${action}`
  const reactionText =
    action === "react"
      ? `Reacted${emoji ? ` ${emoji}` : ""}`
      : "Removed a reaction"

  const { message: reactionRow, isNew } = await repository.createOrUpdate({
    id: createId(),
    conversationId: conversation.id,
    contactInboxId: existingContactInbox.id,
    workspaceId: inbox.workspaceId,
    senderType: "contact",
    senderId: existingContactInbox.contactId,
    sourceId: reactionSourceId,
    messageType: messageTypes.enum.activity,
    contentType: contentTypes.enum.text,
    text: reactionText,
    createdAt: new Date(),
  })

  if (isNew) {
    try {
      broadcastToWorkspaceParty(inbox.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: reactionRow,
      })
    } catch (error) {
      logger.warn(error, "processMessageReaction: unable to broadcast")
    }
    return
  }

  // Same action reused within createOrUpdate's dedup window (e.g. a changed
  // emoji) — update the existing row instead of silently ignoring it.
  if (reactionRow.text !== reactionText) {
    const updated = await repository.updateMessageText(
      reactionRow.id,
      inbox.workspaceId,
      reactionText,
      reactionRow.createdAt,
    )
    if (updated) {
      try {
        broadcastToWorkspaceParty(inbox.workspaceId, {
          eventType: RealtimeEventType.messageUpdated,
          data: {
            messageId: updated.id,
            newText: reactionText,
            removedAttachment: false,
          },
        })
      } catch (error) {
        logger.warn(error, "processMessageReaction: unable to broadcast update")
      }
    }
  }
}

// Shared by the direct-hit path and the unique-violation race recovery below
// (D8): syncs newly-learned identity fields onto the matched row, then
// resolves/opens the conversation.
const buildExistingContactMatch = async (props: {
  inbox: InboxModel
  incomingContact: IncomingContact
  conversationSourceId: string | null
  existing: ContactInboxWithContact
}): Promise<{
  contactInbox: ContactInboxModel
  contact: ContactModel
  conversation: ConversationModel
  isNewContact: false
}> => {
  const { inbox, incomingContact, conversationSourceId, existing } = props
  const { contact, ...contactInbox } = existing

  const { contactInbox: syncedContactInbox, learnedPrimaryIdentity } =
    await contactInboxService.syncScopedIdentity({
      contactInbox,
      incomingContact,
    })

  // Phone learned later on a BSUID-keyed row (D3): write it to
  // Contact.phoneNumber only — never rewrite ContactInbox.sourceId. Kept at
  // this call site (not inside the contact-inbox service) so contactService
  // stays a caller-level composition, not a cross-domain import.
  let syncedContact = contact
  if (learnedPrimaryIdentity) {
    try {
      syncedContact = await contactService.update(
        { workspaceId: inbox.workspaceId, id: contact.id },
        { phoneNumber: learnedPrimaryIdentity },
      )
    } catch (error) {
      logger.warn(
        {
          error,
          contactId: contact.id,
          contactInboxId: syncedContactInbox.id,
        },
        "Contact.phoneNumber backfill from newly-learned identity failed",
      )
    }
  }

  const conversation = await conversationService.findOrCreate({
    workspaceId: inbox.workspaceId,
    contactId: syncedContactInbox.contactId,
    sourceId: conversationSourceId,
  })

  return {
    contactInbox: syncedContactInbox,
    contact: syncedContact,
    conversation,
    isNewContact: false,
  }
}

const CONTACT_INBOX_IDENTITY_CONSTRAINTS = [
  CONTACT_INBOX_SOURCE_ID_KEY,
  CONTACT_INBOX_SOURCE_USER_ID_KEY,
] as const

const isContactInboxIdentityRace = (error: unknown): boolean =>
  CONTACT_INBOX_IDENTITY_CONSTRAINTS.some((constraint) =>
    isUniqueViolationError(error, constraint),
  )

export const detectContactAndConversation = async (props: {
  inbox: InboxModel
  incomingContact: IncomingContact
  integrationRow: {
    id: string
    auth: AuthValue
    inboxId: string
    [x: string]: unknown
  }
  source: ContactSource
}): Promise<{
  contactInbox: ContactInboxModel
  contact: ContactModel
  conversation: ConversationModel
  isNewContact: boolean
}> => {
  const { incomingContact, inbox, integrationRow, source } = props

  const existingContactInbox = await resolveExistingContactInbox({
    inbox,
    incomingContact,
  })

  // The conversation source id (e.g. a Facebook post id for comments) keys the
  // conversation; it is null for ordinary DMs. Carried on the conversation row,
  // not the contactInbox (see f0cc49d).
  const conversationSourceId = incomingContact.sourceConversationId ?? null

  // Returning contact: no quota gate (MAC only counts brand-new contacts).
  // `findOrCreate` resolves the existing conversation or opens a fresh one when
  // the source id is new (e.g. a comment on a different post).
  if (existingContactInbox) {
    return await buildExistingContactMatch({
      inbox,
      incomingContact,
      conversationSourceId,
      existing: existingContactInbox,
    })
  }

  // Used below to skip phone-hint inference when the sourceId is a scoped
  // user id (e.g. a WhatsApp BSUID), not an actual phone number (§8.1).
  const isBsuidKeyedIncomingContact =
    isSourceUserIdKeyedIdentity(incomingContact)

  try {
    return await createNewContactAndContactInbox({
      inbox,
      integrationRow,
      incomingContact,
      source,
      conversationSourceId,
      isBsuidKeyedIncomingContact,
    })
  } catch (error) {
    // D8: two concurrent first-messages from the same identity can both pass
    // the resolver-chain miss above. The loser hits a unique-violation on
    // either `(inboxId, sourceId)` or the new partial `(inboxId,
    // sourceUserId)` index; its transaction rolls back (no orphan Contact, no
    // MAC double-count). Re-run the resolver chain and return the winning
    // row instead of dead-lettering the job.
    if (!isContactInboxIdentityRace(error)) {
      throw error
    }
    logger.warn(
      { inboxId: inbox.id, sourceId: incomingContact.sourceId },
      "ContactInbox creation race detected; resolving winning row",
    )
    const winner = await resolveExistingContactInbox({
      inbox,
      incomingContact,
    })
    if (!winner) {
      throw error
    }
    return await buildExistingContactMatch({
      inbox,
      incomingContact,
      conversationSourceId,
      existing: winner,
    })
  }
}

const createNewContactAndContactInbox = async (props: {
  inbox: InboxModel
  integrationRow: {
    id: string
    auth: AuthValue
    inboxId: string
    [x: string]: unknown
  }
  incomingContact: IncomingContact
  source: ContactSource
  conversationSourceId: string | null
  isBsuidKeyedIncomingContact: boolean
}): Promise<{
  contactInbox: ContactInboxModel
  contact: ContactModel
  conversation: ConversationModel
  isNewContact: true
}> => {
  const {
    inbox,
    integrationRow,
    incomingContact,
    source,
    conversationSourceId,
    isBsuidKeyedIncomingContact,
  } = props

  let contactData: typeof contactModel.$inferInsert = {
    ...incomingContact,
    workspaceId: inbox.workspaceId,
  }
  if (hasOnDemandProfileApi(inbox.channel as ChannelType)) {
    const integrationType =
      inbox.channel === "instagram" && isInstagramViaFacebook(integrationRow)
        ? "instagramFacebook"
        : inbox.channel
    const profileIntegration = allIntegrations[integrationType]
    if (profileIntegration) {
      const profileCtx = await buildContext({
        workspaceId: inbox.workspaceId,
        integrationType,
        integration: integrationRow,
      })
      try {
        const userProfile = await profileIntegration.runChannelHandler(
          "contact",
          "getProfile",
          {
            ctx: profileCtx,
            data: { sourceId: incomingContact.sourceId },
          },
        )
        contactData = {
          ...contactData,
          ...userProfile,
        }
      } catch (error) {
        logger.warn(
          { error, sourceId: incomingContact.sourceId, channel: inbox.channel },
          "detectContactAndConversation: getProfile failed, creating contact without profile data",
        )
        // No `contactId` — the contact does not exist yet at this point.
        // `recordProfileRefreshFailure` never throws by contract.
        await recordProfileRefreshFailure({
          channel: inbox.channel,
          workspaceId: inbox.workspaceId,
          error,
        })
      }
    }
  }

  const finalizedProfile = finalizeContactProfile(
    {
      locale: contactData.locale,
      language: incomingContact.language,
      timezone: contactData.timezone,
    },
    {
      // §8.1: a BSUID-keyed identity is not a phone number — feeding it here
      // would infer garbage locale/timezone. Only pass the sourceId as a
      // phone hint when it is NOT BSUID-keyed (deterministic per D2).
      phoneHint:
        incomingContact.phoneNumber ??
        (inbox.channel === "whatsapp" && !isBsuidKeyedIncomingContact
          ? incomingContact.sourceId
          : undefined),
      fallbackLocale: inbox.channel === "zalo" ? "vi_VN" : undefined,
    },
  )
  contactData = {
    ...contactData,
    locale: finalizedProfile.locale,
    timezone: finalizedProfile.timezone,
  }

  const ws = await workspaceService.find({ where: { id: inbox.workspaceId } })
  if (!ws) {
    throw new Error("Workspace not found")
  }

  // MAC (monthly active contacts) is the billing hard gate. Gate + insert +
  // consume run atomically so concurrent inbound messages for new contacts
  // cannot overrun the limit; the `ContactActiveMonthly` presence row written
  // inside the transaction makes the `message:received` event emitted later a
  // dedup no-op (no double count). `contacts` stays the info-only metric.
  // Contact + ContactInbox creation share this one transaction (D8): a losing
  // insert's unique-violation rolls back both rows together — no orphan
  // Contact — and is recovered by the caller's try/catch above.
  const result = await quotaEnforcementService.createNewContactWithMac({
    ownerId: ws.ownerId,
    workspaceId: inbox.workspaceId,
    create: async (tx) => {
      const newContact = await tx
        .insert(contactModel)
        .values({
          id: createId(),
          ...contactData,
        })
        .returning()
        .then((rows) => rows[0])
      if (!newContact) {
        throw new Error("Contact not found")
      }

      const contactInbox = await tx
        .insert(contactInboxModel)
        .values({
          id: createId(),
          inboxId: inbox.id,
          contactId: newContact.id,
          originalContactId: newContact.id,
          source,
          sourceId: incomingContact.sourceId,
          sourceUserId: incomingContact.sourceUserId ?? null,
          sourceUsername: incomingContact.sourceUsername ?? null,
          channel: inbox.channel,
          language: finalizedProfile.language,
        })
        .returning()
        .then((rows) => rows[0])
      if (!contactInbox) {
        throw new Error("Contact inbox not found")
      }

      // A re-created contact keeps its history: cancel any pending message
      // cleanup recorded when a contact with this inbox identity was deleted.
      await messageCleanupService.cancelByInboxSource({
        inboxId: inbox.id,
        sourceIds: [contactInbox.sourceId],
        tx,
      })

      const conversation = await conversationService.findOrCreate({
        workspaceId: inbox.workspaceId,
        contactId: newContact.id,
        sourceId: conversationSourceId,
        tx,
      })

      return {
        value: { newContact, contactInbox, conversation },
        contactId: newContact.id,
        contactInboxId: contactInbox.id,
        inboxId: inbox.id,
      }
    },
  })

  if (!result.ok) {
    // The MAC (billing) cap is a deterministic business outcome, not a
    // transient failure: retrying never succeeds. Throw UnrecoverableError so
    // BullMQ fails the job once without retry/backoff instead of dead-lettering
    // the inbound message after exhausting attempts. Logged at `error` (with
    // enough context to identify the dropped contact) so a brand-new
    // contact's first-ever message being silently dropped is discoverable via
    // alerting, not just the account-level MAC banner (which only reflects
    // the aggregate cap, not this specific drop).
    logger.error(
      {
        workspaceId: inbox.workspaceId,
        ownerId: ws.ownerId,
        channel: inbox.channel,
        sourceId: incomingContact.sourceId,
      },
      "Inbound new-contact rejected: MAC limit reached",
    )
    throw new UnrecoverableError("contact_mac_limit_reached")
  }

  const { newContact, contactInbox, conversation } = result.value

  await emitContactCreated(
    newContact.workspaceId,
    newContact.id,
    newContact.firstName || undefined,
    newContact.phoneNumber || undefined,
    newContact.email || undefined,
    contactInbox.id,
  )

  if (contactInbox.sourceId) {
    emit("analytics:dashboard", {
      eventType: "contact:created",
      workspaceId: newContact.workspaceId,
      contactId: contactInbox.id,
      occurredAt: newContact.createdAt,
      source: contactInbox.source,
      sourceId: contactInbox.sourceId,
      channel: contactInbox.channel,
      metadata: {
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "receiveMessage",
          triggerType: "contact_created",
        },
      },
    })
  }

  return { contactInbox, contact: newContact, conversation, isNewContact: true }
}
