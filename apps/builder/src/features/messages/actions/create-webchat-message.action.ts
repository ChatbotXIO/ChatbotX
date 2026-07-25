"use server"

import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  contactInboxService,
  contactService,
  conversationService,
  isWorkspaceScheduledForDeletion,
  messageCleanupService,
  quotaEnforcementService,
  resolveTenantSettings,
  workspaceService,
} from "@chatbotx.io/business"
import { resolveLastUserInputTracking } from "@chatbotx.io/business/contact-inbox"
import { finalizeContactProfile } from "@chatbotx.io/business/contact-locale"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  type ConversationAttributes,
  channelTypes,
  contactSources,
} from "@chatbotx.io/database/partials"
import type { MessageWithAttachments } from "@chatbotx.io/database/repositories"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
  integrationWebchatModel,
} from "@chatbotx.io/database/schema"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitContactCreated } from "@chatbotx.io/events"
import { setWebhookExecutionContext } from "@chatbotx.io/events/context"
import { type UploadedFile, uploadMultipleFiles } from "@chatbotx.io/filesystem"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { createId } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { randomString } from "remeda"
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

  const integrationWebchat = await findOrFail({
    table: integrationWebchatModel,
    where: {
      workspaceId: parsedInput.workspaceId,
      id: parsedInput.webchatId,
    },
    message: "Channel not found",
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
    await getConversationFromInput(parsedInput, integrationWebchat, workspace)

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
    const repository = await createMessageRepository()

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

    const message: MessageWithAttachments =
      attachmentInputs.length > 0
        ? await repository.createWithAttachments(messageInput, attachmentInputs)
        : { ...(await repository.create(messageInput)), attachments: [] }

    const newMessage = {
      ...message,
      attachments: message.attachments.map((attachment) => ({
        ...attachment,
        url: getPublicFileUrl(attachment.originPath, storageUrl),
      })),
    }

    await db
      .update(conversationModel)
      .set({
        contactLastReadAt: now,
        lastActivityAt: message.createdAt,
        contactRepliedAt: message.createdAt,
      })
      .where(eq(conversationModel.id, conversation.id))

    await contactInboxService.updateTracking({
      contactInboxId: contactInbox.id,
      contactId: contactInbox.contactId,
      workspaceId: conversation.workspaceId,
      data: {
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

    const promises: Promise<unknown>[] = []
    promises.push(
      chatQueue.add(ChatJobAction.broadcastEvent, {
        type: ChatJobAction.broadcastEvent,
        data: {
          workspaceId: newMessage.workspaceId,
          event: {
            eventType: RealtimeEventType.messageCreated,
            data: {
              ...newMessage,
              clientId: parsedInput.clientId,
            },
          },
        },
      }),
    )

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
  integrationWebchat: typeof integrationWebchatModel.$inferSelect,
  workspace: WorkspaceModel | undefined,
) {
  const sourceId = parsedInput.guestConversationId

  const existingContactInbox = await contactInboxService.findLatestBySource({
    inboxId: integrationWebchat.inboxId,
    sourceId,
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
      workspaceOwnerId: null as string | null,
    }
  }

  // New contact. Resolve the owner (owner-derived, never request-derived) and
  // gate on MAC — the billing hard limit — atomically with the insert so
  // concurrent first-message requests cannot both pass the gate and overrun the
  // limit. MAC is consumed here (not via the async message event) and the
  // `ContactActiveMonthly` presence row written inside the same transaction so
  // the later `message:received` event dedups instead of double-counting. The
  // info-only `contacts` metric is recorded inside `createNewContactWithMac`.
  const ws = workspace
  if (!ws) {
    throw new ChatbotXException("Workspace not found", "notFound", 404)
  }

  const result = await quotaEnforcementService.createNewContactWithMac({
    ownerId: ws.ownerId,
    workspaceId: parsedInput.workspaceId,
    create: async (tx) => {
      const finalizedProfile = finalizeContactProfile({
        locale: parsedInput.locale,
        timezone: parsedInput.timezone,
      })
      const contact = await tx
        .insert(contactModel)
        .values({
          id: createId(),
          workspaceId: parsedInput.workspaceId,
          email: parsedInput.guestConversationId,
          gender: "unknown",
          firstName: "Guest",
          lastName: randomString(10),
          locale: finalizedProfile.locale,
          timezone: finalizedProfile.timezone,
        })
        .returning()
        .then((rows) => rows[0])
      if (!contact) {
        throw new ChatbotXException("Contact not found")
      }

      const contactInbox = await tx
        .insert(contactInboxModel)
        .values({
          id: createId(),
          inboxId: integrationWebchat.inboxId,
          contactId: contact.id,
          originalContactId: contact.id,
          source: contactSources.enum.webchat,
          sourceId,
          channel: "webchat",
          language: finalizedProfile.language,
          webchatParentUrl: parsedInput.parentUrl,
        })
        .returning()
        .then((rows) => rows[0])
      if (!contactInbox) {
        throw new ChatbotXException("Contact inbox not found")
      }

      // A re-created contact keeps its history: cancel any pending message
      // cleanup recorded when a contact with this inbox identity was deleted.
      await messageCleanupService.cancelByInboxSource({
        inboxId: integrationWebchat.inboxId,
        sourceIds: [contactInbox.sourceId],
        tx,
      })

      const conversation = await tx
        .insert(conversationModel)
        .values({
          id: createId(),
          workspaceId: parsedInput.workspaceId,
          contactId: contact.id,
        })
        .returning()
        .then((rows) => rows[0])
      if (!conversation) {
        throw new ChatbotXException("Conversation not found")
      }

      return {
        value: { contact, contactInbox, conversation },
        contactId: contact.id,
        contactInboxId: contactInbox.id,
        inboxId: integrationWebchat.inboxId,
      }
    },
  })

  if (!result.ok) {
    throw new ChatbotXException("Contact limit reached", "quotaExceeded", 422)
  }

  await emitContactCreated(
    parsedInput.workspaceId,
    result.value.contact.id,
    result.value.contact.firstName || undefined,
    result.value.contact.phoneNumber || undefined,
    result.value.contact.email || undefined,
  )

  return {
    conversation: result.value.conversation,
    contact: result.value.contact,
    contactInbox: result.value.contactInbox,
    isNewContact: true,
    workspaceOwnerId: ws.ownerId as string | null,
  }
}
