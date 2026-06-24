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
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import {
  ChannelError,
  parseSdkError,
  type SendFlowStepData,
} from "@chatbotx.io/sdk"
import type {
  ChatJobChangeChannelMessageState,
  ChatJobDeleteChannelMessage,
  ChatJobEditChannelMessage,
  ChatJobSendChannelMessage,
  ChatJobSendTyping,
} from "@chatbotx.io/worker-config"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  allIntegrations,
  resolveIntegrationContextFromContactInbox,
} from "../../services/integrations"

export async function sendMessageToChannel(
  data: ChatJobSendChannelMessage["data"],
) {
  const { conversation, contactInbox, message, metadata, sendFrom } = data

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
          replyToCommentId: parentMsg?.sourceId ?? null,
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
        const repo = await createMessageRepository()
        await repo.updateSourceId(message.id, replyId, conversation.workspaceId)

        // Notify the client so edit/delete buttons appear immediately without a refresh.
        await chatQueue.add(ChatJobAction.broadcastEvent, {
          type: ChatJobAction.broadcastEvent,
          data: {
            workspaceId: conversation.workspaceId,
            event: {
              eventType: RealtimeEventType.messageIdAssigned,
              data: { messageId: message.id, commentId: replyId },
            },
          },
        })
      }
    } else {
      // Persist the provider message id as this row's sourceId. The channel
      // echoes every page-sent message back via webhook (coexist); the echo
      // handler dedups through createOrUpdate → findBySourceId. Without a
      // sourceId here, bot/agent outgoing rows stay sourceId=null, the echo
      // lookup misses, and a duplicate row is inserted as senderType=user.
      await updateMessageSourceId(message.id, conversation.workspaceId, result)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
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
      errorData: await parseSdkError(error),
      occurredAt: new Date(),
      metadata,
    })
    if (error instanceof ChannelError && !error.isRetryable) {
      return
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

async function updateMessageSourceId(
  messageId: string | undefined,
  workspaceId: string,
  result: { messageIds: string[] },
) {
  try {
    const firstMessageId = result?.messageIds?.[0]
    if (messageId && firstMessageId) {
      const repo = await createMessageRepository()
      await repo.updateSourceId(messageId, firstMessageId, workspaceId)
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
  metadata,
  messageId,
  sendFrom,
}: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowId: string
  flowVersionId?: string
  step: SendFlowStepData
  metadata?: MetadataPayload
  messageId?: string
  sendFrom?: "inbox"
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
        metadata,
        sendFrom,
      },
    },
  )

  await updateMessageSourceId(messageId, conversation.workspaceId, result)

  return result
}
