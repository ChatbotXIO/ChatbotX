import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  appointmentService,
  broadcastToWorkspaceParty,
  buildContext,
  type ContactInboxTrackingData,
  contactInboxService,
  contactService,
  conversationService,
  messageCleanupService,
  quotaEnforcementService,
  resolveTenantSettings,
  updateContactFromMessage,
  workspaceService,
} from "@chatbotx.io/business"
import { resolveLastUserInputTracking } from "@chatbotx.io/business/contact-inbox"
import {
  finalizeContactProfile,
  normalizeLanguage,
} from "@chatbotx.io/business/contact-locale"
import { db, eq, isUniqueViolationError } from "@chatbotx.io/database/client"
import {
  type ContactSource,
  contactSources,
  type IntegrationType,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  CONTACT_INBOX_SOURCE_ID_KEY,
  CONTACT_INBOX_SOURCE_USER_ID_KEY,
  contactInboxModel,
  contactModel,
  conversationModel,
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
    }
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

  const trackingInvalidation = await db.transaction(async (tx) => {
    const invalidation = await contactInboxService.updateTracking({
      tx,
      contactInboxId: contactInbox.id,
      contactId: contactInbox.contactId,
      workspaceId: inbox.workspaceId,
      data: {
        ...getMessageActivityTracking({ incomingMessage, message, storageUrl }),
        ...contactInboxTracking,
      },
    })

    if (contactLocation) {
      await contactService.update(
        { workspaceId: inbox.workspaceId, id: contactInbox.contactId },
        { location: contactLocation },
        tx,
      )
    }

    await tx
      .update(conversationModel)
      .set({ lastActivityAt: message.createdAt })
      .where(eq(conversationModel.id, conversation.id))

    return invalidation
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

  if (
    incomingMessage.messageType !== "outgoing" &&
    (incomingMessage.type ?? "message") === "message"
  ) {
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
    db.query.contactInboxModel.findFirst({
      where: { inboxId: inbox.id, channel: inbox.channel, ...where },
      with: { contact: true },
    }),
  )

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
  if (canGetUserProfileIfNeeded(inbox.channel)) {
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
    // the inbound message after exhausting attempts. Logged at `warn` so the
    // cap is observable without paging on expected behavior.
    logger.warn(
      { workspaceId: inbox.workspaceId, ownerId: ws.ownerId },
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

const canGetUserProfileIfNeeded = (integrationType: string) =>
  integrationType === "messenger" ||
  integrationType === "instagram" ||
  integrationType === "zalo" ||
  integrationType === "telegram"
