import {
  automatedResponseService,
  isKeywordMediaFileType,
} from "@chatbotx.io/automated-response"
import {
  conversationService,
  getContactInputAttachments,
} from "@chatbotx.io/business"
import { emit } from "@chatbotx.io/event-bus"
import {
  IntegrationJobAction,
  type IntegrationJobReceiveMessage,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { resolveIncomingTextRouting } from "../routing"
import { dispatchStoryAutomation } from "../story-automation-dispatch"
import { receiveMessage } from "./received-message"
import { recordWhatsappCallPermissionReply } from "./whatsapp-call-permission-reply"

/**
 * Ingests one channel message and routes it to the automation that answers it.
 * Shared by `incomingMessage` (a customer's message, `integration` queue) and
 * `incomingMessageEcho` (a message the account itself sent, `low` queue): both
 * are stored, and an echo simply never matches the contact-input rules below.
 */
export async function processIncomingMessage(
  data: IntegrationJobReceiveMessage["data"],
): Promise<void> {
  const received = await receiveMessage(data)
  if (!received) {
    return
  }
  const {
    message,
    postbackAction,
    quickReplyAction,
    conversation,
    channelType,
    inboxId,
    inboxChannel,
    suppressAutomation,
    stepInputSkipHandled,
  } = received

  if (!message) {
    return
  }

  const isNotPostbackOrQuickReply = !(postbackAction || quickReplyAction)

  // A call-permission answer is account state, recorded for
  // standby deliveries too; it never reaches automation.
  if (
    isNotPostbackOrQuickReply &&
    (await recordWhatsappCallPermissionReply({
      workspaceId: conversation.workspaceId,
      message,
    }))
  ) {
    return
  }

  // Standby deliveries (another responder owns the thread) are
  // stored only: no story-reply, routing or fallback analytics.
  if (suppressAutomation) {
    return
  }

  // A Skip tap was enqueued as its own resolution; its text must not
  // also be routed to the pending challenge as a typed reply.
  if (stepInputSkipHandled) {
    return
  }

  // An image/file message has contentType "text" — only its
  // `attachments` array distinguishes it; a shared location has
  // contentType "location".
  const isFromContact =
    isNotPostbackOrQuickReply && message.senderType === "contact"
  const inputAttachments = getContactInputAttachments(message)
  const hasAttachment = inputAttachments.length > 0
  const isLocation = message.contentType === "location"

  if (
    isFromContact &&
    (await dispatchStoryAutomation({
      message,
      conversation,
      channelType,
    }))
  ) {
    return
  }

  const attachmentFileTypes = inputAttachments.map(
    (attachment) => attachment.fileType,
  )
  const routing = await resolveIncomingTextRouting({
    conversation,
    hasActionableInput: Boolean(
      isFromContact && (message.text || hasAttachment || isLocation),
    ),
    hasText: Boolean(isFromContact && message.text),
    hasKeywordMedia: Boolean(
      isFromContact && attachmentFileTypes.some(isKeywordMediaFileType),
    ),
    isConversationActive: (conversation) =>
      conversationService.ensureActive(conversation),
  })

  // Messages without content, not from the contact, or media no
  // keyword matched get no response (postback/quickReply are
  // tracked in their own handlers).
  const trackNoResponse = () =>
    emit("analytics:dashboard", {
      eventType: "message:bot_received",
      workspaceId: message.workspaceId,
      conversationId: message.conversationId,
      channel: inboxChannel,
      inboxId,
      messageId: message.id,
      occurredAt: new Date(),
      hasResponse: false,
      responseType: "none",
      routeType: "fallback",
      result: "fallback",
      aiProvider: "none",
      metadata: {
        latency: 0,
        fallbackReason: message.text ? "not_from_contact" : "no_content",
      },
    })

  if (routing.type === "challenge") {
    await integrationQueue.add(
      IntegrationJobAction.runChallenge,
      {
        type: IntegrationJobAction.runChallenge,
        data: {
          conversationId: routing.conversation.id,
          contactInboxId: message.contactInboxId,
          messageId: message.id,
          messageCreatedAt: message.createdAt,
          challenge: routing.challenge,
        },
      },
      {
        jobId: `questionnaire-challenge-${routing.conversation.id}-${message.id}`,
      },
    )
  } else if (routing.type === "automatedResponse") {
    const enqueued = await automatedResponseService.enqueue({
      conversationId: routing.conversation.id,
      contactInboxId: message.contactInboxId,
      messageId: message.id,
      messageText: message.text ?? "",
      attachmentFileTypes,
      workspaceId: routing.conversation.workspaceId,
    })
    if (!enqueued) {
      await trackNoResponse()
    }
  } else if (routing.type === "handoffReentry") {
    await automatedResponseService.enqueueHandoffReentry({
      conversationId: routing.conversation.id,
      contactInboxId: message.contactInboxId,
      messageId: message.id,
      workspaceId: routing.conversation.workspaceId,
    })
  } else if (isNotPostbackOrQuickReply) {
    await trackNoResponse()
  }
}
