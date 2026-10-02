"use server"

import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  contactInboxService,
  contactService,
  conversationService,
  integrationWebchatService,
  isWorkspaceScheduledForDeletion,
  messageService,
  publishWorkspaceRealtimeEvent,
  resolveTenantSettings,
  workspaceService,
} from "@chatbotx.io/business"
import { resolveLastUserInputTracking } from "@chatbotx.io/business/contact-inbox"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import {
  type ConversationAttributes,
  channelTypes,
} from "@chatbotx.io/database/partials"
import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { setWebhookExecutionContext } from "@chatbotx.io/events/context"
import { type UploadedFile, uploadMultipleFiles } from "@chatbotx.io/filesystem"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import {
  RealtimeEventType,
  routeForConversation,
} from "@chatbotx.io/realtime-protocol"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { isOriginAuthorized } from "@/features/integration-webchat/lib/authorized-domain"
import { verifyWebchatAccessToken } from "@/features/integration-webchat/lib/webchat-access-token"
import { logger } from "@/lib/log"
import {
  checkGuestRateLimit,
  getGuestClientIp,
} from "@/lib/rate-limit/guest-rate-limit"
import { actionClient } from "@/lib/safe-action"
import {
  type CreateWebchatMessageRequest,
  createWebchatMessageRequest,
} from "../schema/mutation"

export const createWebchatMessageAction = actionClient
  .inputSchema(createWebchatMessageRequest)
  .action(handleCreateWebchatMessage)

async function getRequestHeaders() {
  try {
    return await headers()
  } catch {
    return new Headers()
  }
}

export async function handleCreateWebchatMessage({
  parsedInput,
}: {
  parsedInput: CreateWebchatMessageRequest
}) {
  setWebhookExecutionContext({ source: "webhook" })

  const workspace = await workspaceService.find({
    where: { id: parsedInput.workspaceId },
  })
  if (workspace && isWorkspaceScheduledForDeletion(workspace)) {
    const t = await getTranslations("webchat")
    throw new ChatbotXException(
      t("workspaceUnavailable"),
      "workspaceScheduledDeletion",
      403,
    )
  }

  const integrationWebchat =
    await integrationWebchatService.findByIdForWorkspace({
      workspaceId: parsedInput.workspaceId,
      id: parsedInput.webchatId,
    })

  // Bind-on-first-use: always require a token whose signed origin claim
  // matches the origin the caller is presenting now, regardless of whether
  // authorizedDomains is configured. This closes the "no auth at all when no
  // allowlist is set" gap while still layering the (optional) domain
  // allowlist check on top when the workspace has configured one.
  const { authorized } = await verifyWebchatAccessToken({
    token: parsedInput.accessToken,
    workspaceId: parsedInput.workspaceId,
    webchatId: parsedInput.webchatId,
    origin: parsedInput.parentOrigin,
  })

  if (!authorized) {
    const t = await getTranslations("webchat.unauthorizedDomain")
    throw new ChatbotXException(t("description"), "forbidden", 403)
  }

  if (
    integrationWebchat.authorizedDomains.length > 0 &&
    !isOriginAuthorized(
      parsedInput.parentOrigin,
      integrationWebchat.authorizedDomains,
    )
  ) {
    const t = await getTranslations("webchat.unauthorizedDomain")
    throw new ChatbotXException(t("description"), "forbidden", 403)
  }

  const requestHeaders = await getRequestHeaders()
  const rateLimit = await checkGuestRateLimit({
    clientIp: getGuestClientIp(requestHeaders),
    guestConversationId: parsedInput.guestConversationId,
    webchatId: parsedInput.webchatId,
  })
  if (rateLimit.limited) {
    const t = await getTranslations("webchat")
    throw new ChatbotXException(
      t("rateLimitExceeded"),
      "rateLimitExceeded",
      429,
    )
  }

  const { conversation, isNewContact, contact, contactInbox } =
    await getConversationFromInput(parsedInput, integrationWebchat)

  if (
    "init" in parsedInput &&
    parsedInput.init &&
    isNewContact &&
    integrationWebchat.welcomeFlowId
  ) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: integrationWebchat.welcomeFlowId,
        origin: "channel",
      },
    })
  }

  const { storageUrl } = await resolveTenantSettings({
    workspaceId: parsedInput.workspaceId,
  })

  // Process flow if exists. Only a flowId that is actually configured as one
  // of this webchat's persistent-menu "flow" entries may be triggered here —
  // otherwise a guest holding a valid access token could enqueue an
  // arbitrary flowId for this workspace (flow injection / IDOR).
  if ("flowId" in parsedInput) {
    const isConfiguredFlow = integrationWebchat.persistentMenus.some(
      (menu) => menu.type === "flow" && menu.flowId === parsedInput.flowId,
    )
    if (!isConfiguredFlow) {
      throw new ChatbotXException("Flow not found", "notFound", 404)
    }

    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: parsedInput.flowId,
        origin: "channel",
      },
    })
    return null
  }

  if ("init" in parsedInput) {
    return null
  }

  // Process ref if exists
  if ("initRef" in parsedInput && parsedInput.initRef) {
    await integrationQueue.add(IntegrationJobAction.runRef, {
      type: IntegrationJobAction.runRef,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        ref: parsedInput.initRef,
        isNewContact,
      },
    })
    return null
  }

  if ("postback" in parsedInput && parsedInput.postback) {
    await automatedResponseService.enqueueFlowAction({
      kind: "postback",
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        action: parsedInput.postback,
      },
    })
  }

  // Upload file if exists
  let uploadedFiles: UploadedFile[] = []
  if ("files" in parsedInput && parsedInput.files.length > 0) {
    uploadedFiles = await uploadMultipleFiles(
      parsedInput.files,
      `public/space/${parsedInput.workspaceId}/conversations/${conversation.id}`,
    )
  }

  if ("text" in parsedInput && (parsedInput.text || uploadedFiles.length > 0)) {
    const now = new Date()
    const messageInput = {
      text: parsedInput.text ?? null,
      messageType: "incoming" as const,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      senderType: "contact" as const,
      senderId: conversation.contactId,
      contentType: "text" as const,
      contactInboxId: contactInbox.id,
      createdAt: now,
    }

    const attachmentInputs = uploadedFiles.map((file) => ({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      ...file,
    }))

    const message =
      attachmentInputs.length > 0
        ? await messageService.createWithAttachments({
            message: messageInput,
            attachments: attachmentInputs,
          })
        : { ...(await messageService.create(messageInput)), attachments: [] }

    const newMessage = {
      ...message,
      attachments: message.attachments.map((attachment) => ({
        ...attachment,
        url: getPublicFileUrl(attachment.originPath, storageUrl),
      })),
    }

    const trackingInvalidation =
      await conversationService.recordInboundActivity({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        contactId: contactInbox.contactId,
        at: message.createdAt,
        contactRepliedAt: message.createdAt,
        contactLastReadAt: now,
        tracking: {
          firstInteractionAt: message.createdAt,
          contactLastReadAt: now,
          lastMessageAt: message.createdAt,
          lastIncomingMessageAt: message.createdAt,
          ...resolveLastUserInputTracking({
            contentType: message.contentType,
            text: message.text,
            attachments: message.attachments,
            storageUrl,
          }),
          ...(parsedInput.parentUrl && {
            webchatParentUrl: parsedInput.parentUrl,
          }),
        },
      })
    if (trackingInvalidation) {
      await contactInboxService.invalidateTracking(trackingInvalidation)
    }

    try {
      await contactService.unblockIfBlocked(
        { workspaceId: conversation.workspaceId, id: contactInbox.contactId },
        contact,
      )
    } catch (error) {
      logger.warn(
        { error, contactId: contactInbox.contactId, channel: "webchat" },
        "Auto-unblock on webchat inbound message failed",
      )
    }

    emit(messageEventTypeSchema.enum["message:received"], {
      workspaceId: conversation.workspaceId,
      contactId: contactInbox.contactId,
      contactInboxId: contactInbox.id,
      channel: channelTypes.enum.webchat,
      inboxId: contactInbox.inboxId,
      occurredAt: newMessage.createdAt ?? new Date(),
      sourceId: newMessage.sourceId ?? undefined,
    })

    await publishWorkspaceRealtimeEvent(newMessage.workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: {
        ...newMessage,
        clientId: parsedInput.clientId,
      },
      route: routeForConversation({
        assignedUserId: conversation.assignedUserId,
        assignedInboxTeamId: conversation.assignedInboxTeamId,
      }),
    })

    const promises: Promise<unknown>[] = []

    const additionalAttributes =
      conversation.additionalAttributes as unknown as ConversationAttributes

    if (additionalAttributes?.challenge) {
      promises.push(
        integrationQueue.add(
          IntegrationJobAction.runChallenge,
          {
            type: IntegrationJobAction.runChallenge,
            data: {
              conversationId: conversation,
              contactInboxId: contactInbox,
              challenge: additionalAttributes?.challenge,
            },
          },
          {
            deduplication: {
              id: `conversation-${conversation.id}-challenge`,
            },
          },
        ),
      )
    } else if (
      newMessage.text &&
      !("postback" in parsedInput && parsedInput.postback) &&
      (await conversationService.ensureActive(conversation))
    ) {
      promises.push(
        automatedResponseService.enqueue({
          conversationId: conversation.id,
          contactInboxId: contactInbox.id,
          messageId: newMessage.id,
          messageText: newMessage.text,
          workspaceId: conversation.workspaceId,
        }),
      )
    }

    if (isNewContact && contactInbox.sourceId) {
      emit("analytics:dashboard", {
        eventType: "contact:created",
        workspaceId: parsedInput.workspaceId,
        contactId: contactInbox.id,
        occurredAt: contact.createdAt,
        source: contactInbox.source,
        sourceId: contactInbox.sourceId,
        channel: contactInbox.channel,
        metadata: {
          triggerContext: {
            triggerSource: "api",
            triggerHandler: "createWebchatMessage",
            triggerType: "contact_created",
          },
        },
      })
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises)
    }

    return newMessage
  }

  return null
}

async function getConversationFromInput(
  parsedInput: CreateWebchatMessageRequest,
  integrationWebchat: IntegrationWebchatModel,
) {
  const existingContactInbox = await contactInboxService.findLatestBySource({
    inboxId: integrationWebchat.inboxId,
    sourceId: parsedInput.guestConversationId,
    workspaceId: parsedInput.workspaceId,
  })

  if (existingContactInbox) {
    const conversation = await conversationService.findBy({
      where: {
        workspaceId: parsedInput.workspaceId,
        contactId: existingContactInbox.contactId,
      },
    })
    const contact = await contactService.findById({
      workspaceId: parsedInput.workspaceId,
      id: existingContactInbox.contactId,
    })
    if (!conversation) {
      throw new ChatbotXException("Conversation not found")
    }
    if (!contact) {
      throw new ChatbotXException("Contact not found")
    }

    return {
      conversation,
      contact,
      contactInbox: existingContactInbox,
      isNewContact: false,
    }
  }

  const created = await integrationWebchatService.findOrCreateGuestConversation(
    {
      guestConversationId: parsedInput.guestConversationId,
      locale: parsedInput.locale,
      parentUrl: parsedInput.parentUrl,
      timezone: parsedInput.timezone,
      webchatId: integrationWebchat.id,
      workspaceId: parsedInput.workspaceId,
    },
  )
  if (!created) {
    throw new ChatbotXException("Contact limit reached", "quotaExceeded", 422)
  }

  return {
    conversation: created.conversation,
    contact: created.contact,
    contactInbox: created.contactInbox,
    isNewContact: true,
  }
}
