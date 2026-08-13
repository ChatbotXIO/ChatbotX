import { contactInboxService, contactService } from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import { whatsappFlowModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import {
  type MetadataPayload,
  messageEventTypeSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  type RealtimeEventData,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import {
  type CommentAnchor,
  type MessageButtonTemplate,
  parseSdkError,
  type SendFlowStepData,
} from "@chatbotx.io/sdk"
import type {
  ChatJobChangeChannelMessageState,
  ChatJobDeleteChannelMessage,
  ChatJobEditChannelMessage,
  ChatJobSendChannelMessage,
  ChatJobSendFlowStep,
  ChatJobSendTyping,
} from "@chatbotx.io/worker-config"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  allIntegrations,
  resolveIntegrationContextFromContactInbox,
} from "../../services/integrations"
import { shouldSuppressRetryableChannelError } from "../utils/retry"

function broadcastChatEvent(workspaceId: string, event: RealtimeEventData) {
  return chatQueue.add(ChatJobAction.broadcastEvent, {
    type: ChatJobAction.broadcastEvent,
    data: { workspaceId, event },
  })
}

export async function sendMessageToChannel(
  data: ChatJobSendChannelMessage["data"],
  attemptsMade = 0,
): Promise<{ messageIds: string[] }> {
  const {
    conversation,
    contactInbox,
    message,
    quickReplies,
    metadata,
    sendFrom,
  } = data

  try {
    const { integration, ctx } =
      await resolveIntegrationContextFromContactInbox({
        workspaceId: conversation.workspaceId,
        contactInbox,
      })

    const isComment = message.type === "comment"

    let handlerMessage = message
    if (isComment && message.parentId && message.parentCreatedAt) {
      const repo = await createMessageRepository()
      const parentMsg = await repo.findById({
        id: message.parentId,
        createdAt: new Date(message.parentCreatedAt),
        workspaceId: conversation.workspaceId,
      })
      handlerMessage = {
        ...message,
        contentAttributes: {
          ...message.contentAttributes,
          replyToCommentId:
            parentMsg?.sourceId ??
            message.contentAttributes?.replyToCommentId ??
            null,
        },
      }
    }

    const handlerData = {
      ctx,
      data: {
        contact: {
          ...contactInbox,
          sourceConversationId: conversation.sourceId,
        },
        message: handlerMessage,
        quickReplies: isComment ? undefined : quickReplies,
        metadata,
        sendFrom,
      },
    }

    const result = isComment
      ? await integration.runChannelHandler(
          "comment",
          "sendComment",
          handlerData,
        )
      : await integration.runChannelHandler(
          "message",
          "sendMessage",
          handlerData,
        )

    if (isComment) {
      // When the outgoing message is a comment reply, store the Facebook comment
      // ID of the new reply so the page manager can edit/delete it later.
      const replyId = result.messageIds[0]
      if (message.parentId && replyId && message.id) {
        // The reply was already sent successfully — a failure past this
        // point must never rethrow, or BullMQ retries the whole job and
        // sendComment fires again, posting a second live duplicate reply.
        try {
          const repo = await createMessageRepository()
          await repo.updateSourceId(
            message.id,
            replyId,
            conversation.workspaceId,
            new Date(message.createdAt),
          )

          // Notify the client so edit/delete buttons appear immediately without a refresh.
          await broadcastChatEvent(conversation.workspaceId, {
            eventType: RealtimeEventType.messageIdAssigned,
            data: { messageId: message.id, commentId: replyId },
          })

          if (attemptsMade > 0) {
            await clearMessageSendError(
              message.id,
              message.clientId,
              conversation.workspaceId,
              new Date(message.createdAt),
            )
          }
        } catch (err) {
          logger.error(
            err,
            "Failed to persist comment reply sourceId after a successful send",
          )
        }
      }
    } else {
      // Persist the provider message id as this row's sourceId. The channel
      // echoes every page-sent message back via webhook (coexist); the echo
      // handler dedups through createOrUpdate → findBySourceId. Without a
      // sourceId here, bot/agent outgoing rows stay sourceId=null, the echo
      // lookup misses, and a duplicate row is inserted as senderType=user.
      await updateMessageSourceId(
        message.id,
        conversation.workspaceId,
        new Date(message.createdAt),
        result,
      )

      if (attemptsMade > 0) {
        await clearMessageSendError(
          message.id,
          message.clientId,
          conversation.workspaceId,
          new Date(message.createdAt),
        )
      }
    }

    await contactInboxService.recordOutboundMessageSent({
      contactInboxId: contactInbox.id,
      contactId: contactInbox.contactId,
      workspaceId: conversation.workspaceId,
      at: message.createdAt ?? new Date(),
    })

    if (!isComment) {
      try {
        await contactService.unblockIfBlocked({
          workspaceId: conversation.workspaceId,
          id: conversation.contactId,
        })
      } catch (error) {
        logger.warn(error, "Auto-unblock on successful send failed")
      }
    }

    // Bot-message quota accounting: `chat/worker.ts`'s pre-send gate blocks this
    // job type when `senderType === "bot"` (`isBotMessageQuotaReached`), but
    // nothing previously counted it — the quota gate and the quota meter must
    // stay structurally paired or the gate is enforced against a counter that
    // never moves. Human-sent messages (senderType !== "bot") are unaffected.
    if (message.senderType === "bot") {
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
            triggerHandler: "sendMessageToChannel",
            triggerType: "message_bot_sent_channel",
          },
        },
      })
    }

    return { messageIds: result.messageIds }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
    const errorData = await parseSdkError(error)
    await emit(messageEventTypeSchema.enum["message:failed"], {
      context: {
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        channel: contactInbox.channel,
        contactInboxId: contactInbox.id,
      },
      action: {
        messageId: message?.id ?? "",
      },
      errorData,
      occurredAt: new Date(),
      metadata,
    })
    await recordMessageSendError(
      message?.id,
      message?.clientId,
      conversation.workspaceId,
      message?.createdAt ? new Date(message.createdAt) : undefined,
      errorData.message,
    )
    if (shouldSuppressRetryableChannelError(error, contactInbox.channel)) {
      return { messageIds: [] }
    }
    throw error
  }
}

export async function deleteMessageFromChannel(
  data: ChatJobDeleteChannelMessage["data"],
) {
  const { conversation, contactInbox, message } = data

  const repository = await createMessageRepository()
  const found = await repository.findById({
    id: message.id,
    createdAt: new Date(message.createdAt),
    workspaceId: conversation.workspaceId,
  })

  if (!found) {
    logger.warn(
      { messageId: message.id },
      "deleteMessageFromChannel: message not found in shard",
    )
    return
  }

  if (found.type !== "comment" || !found.sourceId) {
    logger.warn(
      { messageId: message.id, type: found.type },
      "deleteMessageFromChannel: message is not a comment or has no sourceId, skipping",
    )
    return
  }

  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  await integration.runChannelHandler("comment", "deleteComment", {
    ctx,
    data: { commentId: found.sourceId },
  })
}

export async function editMessageFromChannel(
  data: ChatJobEditChannelMessage["data"],
) {
  const { conversation, contactInbox, message, newText, newAttachmentUrl } =
    data

  const repository = await createMessageRepository()
  const found = await repository.findById({
    id: message.id,
    createdAt: new Date(message.createdAt),
    workspaceId: conversation.workspaceId,
  })

  if (!found) {
    logger.warn(
      { messageId: message.id },
      "editMessageFromChannel: message not found in shard",
    )
    return
  }

  if (found.type !== "comment" || !found.sourceId) {
    logger.warn(
      { messageId: message.id, type: found.type },
      "editMessageFromChannel: message is not a comment or has no sourceId, skipping",
    )
    return
  }

  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  await integration.runChannelHandler("comment", "editComment", {
    ctx,
    data: { commentId: found.sourceId, newText, newAttachmentUrl },
  })
}

export async function changeMessageStateOnChannel(
  data: ChatJobChangeChannelMessageState["data"],
) {
  const { conversation, contactInbox, message, liked, hidden } = data

  const repository = await createMessageRepository()
  const found = await repository.findById({
    id: message.id,
    createdAt: new Date(message.createdAt),
    workspaceId: conversation.workspaceId,
  })

  if (!found) {
    logger.warn(
      { messageId: message.id },
      "changeMessageStateOnChannel: message not found in shard",
    )
    return
  }

  if (found.type !== "comment" || !found.sourceId) {
    logger.warn(
      { messageId: message.id, type: found.type },
      "changeMessageStateOnChannel: message is not a comment or has no sourceId, skipping",
    )
    return
  }

  const current =
    (found.attributes as { liked?: boolean; hidden?: boolean } | null) ?? {}
  const newAttributes = {
    liked: liked === undefined ? (current.liked ?? false) : liked,
    hidden: hidden === undefined ? (current.hidden ?? false) : hidden,
  }
  await repository.updateMessageAttributes(
    message.id,
    conversation.workspaceId,
    newAttributes,
    found.createdAt,
  )

  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  const calls: Promise<void>[] = []
  if (liked !== undefined) {
    calls.push(
      integration.runChannelHandler("comment", "likeComment", {
        ctx,
        data: { commentId: found.sourceId, liked },
      }),
    )
  }
  if (hidden !== undefined) {
    calls.push(
      integration.runChannelHandler("comment", "hideComment", {
        ctx,
        data: { commentId: found.sourceId, hidden },
      }),
    )
  }

  await Promise.all(calls)
}

export async function sendTypingToChannel(data: ChatJobSendTyping["data"]) {
  const { conversation, contactInbox, typing, seconds } = data

  if (!allIntegrations[contactInbox.channel]) {
    // Typing is best-effort; missing integration is logged but not fatal.
    logger.debug(
      `No integration registered for typing on channel: ${contactInbox.channel}`,
    )
    return
  }

  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  await integration.runChannelHandler("conversation", "sendTyping", {
    ctx,
    data: { contact: contactInbox, typing, seconds },
  })
}

const MAX_SEND_ERROR_LENGTH = 500

export async function recordMessageSendError(
  messageId: string | undefined,
  clientId: string | undefined,
  workspaceId: string,
  createdAt: Date | undefined,
  errorMessage: string,
) {
  try {
    if (!(messageId && createdAt)) {
      return
    }
    const truncatedError = errorMessage.slice(0, MAX_SEND_ERROR_LENGTH)
    const repo = await createMessageRepository()
    await repo.updateSendError(
      messageId,
      truncatedError,
      workspaceId,
      createdAt,
    )

    await broadcastChatEvent(workspaceId, {
      eventType: RealtimeEventType.messageFailed,
      data: { messageId, clientId, error: truncatedError },
    })
  } catch (err) {
    logger.error(err, "Failed to persist message sendError")
  }
}

async function clearMessageSendError(
  messageId: string | undefined,
  clientId: string | undefined,
  workspaceId: string,
  createdAt: Date | undefined,
) {
  try {
    if (!(messageId && createdAt)) {
      return
    }
    const repo = await createMessageRepository()
    await repo.updateSendError(messageId, null, workspaceId, createdAt)

    await broadcastChatEvent(workspaceId, {
      eventType: RealtimeEventType.messageFailed,
      data: { messageId, clientId, error: null },
    })
  } catch (err) {
    logger.error(
      err,
      "Failed to clear message sendError after a retry succeeded",
    )
  }
}

async function updateMessageSourceId(
  messageId: string | undefined,
  workspaceId: string,
  createdAt: Date | undefined,
  result: { messageIds: string[] },
) {
  try {
    const firstMessageId = result?.messageIds?.[0]
    if (messageId && firstMessageId && createdAt) {
      const repo = await createMessageRepository()
      await repo.updateSourceId(
        messageId,
        firstMessageId,
        workspaceId,
        createdAt,
      )
    }
  } catch (err) {
    logger.error(err, "Failed to update message sourceId with provider id")
  }
}

export async function sendFlowStepToChannel({
  conversation,
  contactInbox,
  flowId,
  flowVersionId,
  step,
  quickReplies,
  metadata,
  richResponse,
  messageId,
  messageCreatedAt,
  sendFrom,
  commentAnchor,
}: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowId: string
  flowVersionId?: string
  step: SendFlowStepData
  quickReplies?: MessageButtonTemplate[]
  metadata?: MetadataPayload
  richResponse?: ChatJobSendFlowStep["data"]["richResponse"]
  messageId?: string
  messageCreatedAt?: Date
  sendFrom?: "inbox"
  commentAnchor?: CommentAnchor
}): Promise<{ messageIds: string[] }> {
  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  let resolvedStep: SendFlowStepData = step

  if (
    step.stepType === stepTypes.enum.whatsappFlow &&
    step.flow.id &&
    !step.flow.sourceId
  ) {
    const [row] = await db
      .select({ sourceId: whatsappFlowModel.sourceId })
      .from(whatsappFlowModel)
      .where(eq(whatsappFlowModel.id, step.flow.id))
      .limit(1)

    if (row?.sourceId) {
      resolvedStep = {
        ...step,
        flow: { ...step.flow, sourceId: row.sourceId },
      }
    }
  }

  const result = await integration.runChannelHandler(
    "message",
    "sendFlowStep",
    {
      ctx,
      data: {
        contact: {
          ...contactInbox,
          sourceConversationId: conversation.sourceId,
        },
        flowId,
        flowVersionId,
        step: resolvedStep,
        quickReplies,
        metadata,
        richResponse,
        sendFrom,
        commentAnchor,
      },
    },
  )

  await updateMessageSourceId(
    messageId,
    conversation.workspaceId,
    messageCreatedAt,
    result,
  )
  await contactInboxService.recordOutboundMessageSent({
    contactInboxId: contactInbox.id,
    contactId: contactInbox.contactId,
    workspaceId: conversation.workspaceId,
    at: new Date(),
  })

  return result
}
