import { broadcastToWorkspaceParty } from "@chatbotx.io/business"
import type { FBCommentReply } from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import type { CommentAutomationChannelType } from "./channel-type"

/**
 * Extra BullMQ options for a comment reply dispatched on this contact's
 * channel. Threads' reply endpoint takes no idempotency key and rate-limits
 * aggressively, so a BullMQ retry would double-post the same public reply —
 * Threads jobs therefore run with a single attempt. Every other channel keeps
 * the queue's default retry policy (returns `undefined`, spreading to
 * nothing).
 */
function commentReplyRetryPolicy(
  contactInbox: ContactInboxModel,
): { attempts: number } | undefined {
  return contactInbox.channel === "threads" ? { attempts: 1 } : undefined
}

/**
 * Post a public Facebook comment reply: creates the outgoing DB message,
 * broadcasts it over realtime, and enqueues the actual send. Shared by the
 * `text` reply type (dispatched immediately, sends after `delay`) and
 * `processCommentAIReply` (already runs inside a job delayed by the caller, so
 * no further `delay` applies).
 */
export async function postPublicCommentReply(props: {
  text: string
  commentId: string
  conversationId: string
  contactInboxId: string
  workspaceId: string
  contactInbox: ContactInboxModel
  parentMessageId?: string | null
  parentMessageCreatedAt?: Date | null
  delay?: number
}): Promise<void> {
  const repo = await createMessageRepository()
  const messageInput = {
    conversationId: props.conversationId,
    contactInboxId: props.contactInboxId,
    workspaceId: props.workspaceId,
    messageType: "outgoing" as const,
    contentType: "text" as const,
    senderType: "bot" as const,
    text: props.text,
    type: "comment" as const,
    contentAttributes: { replyToCommentId: props.commentId },
    parentId: props.parentMessageId ?? null,
    createdAt: new Date(),
  }
  const message = await repo.create(messageInput)
  broadcastToWorkspaceParty(props.workspaceId, {
    eventType: RealtimeEventType.messageCreated,
    data: message,
  }).catch((err: unknown) =>
    logger.error(
      { err, commentId: props.commentId },
      "Unable to emit realtime message",
    ),
  )
  const retryPolicy = commentReplyRetryPolicy(props.contactInbox)
  const queueOptions =
    props.delay === undefined
      ? retryPolicy
      : { delay: props.delay, ...retryPolicy }
  await chatQueue.add(
    ChatJobAction.sendChannelMessage,
    {
      type: ChatJobAction.sendChannelMessage,
      data: {
        conversation: {
          id: props.conversationId,
          workspaceId: props.workspaceId,
        } as ConversationModel,
        contactInbox: props.contactInbox,
        message: {
          ...message,
          parentCreatedAt: props.parentMessageCreatedAt ?? null,
        },
      },
    },
    ...(queueOptions ? [queueOptions] : []),
  )
}

export async function executePublicReply(
  publicReply: FBCommentReply,
  ctx: {
    auth: MessengerAuthValue
    integrationType: string
    integrationIdentifier: string
    commentId: string
    channelType: CommentAutomationChannelType
    conversationId: string
    contactInboxId: string
    delay: number
    workspaceId: string
    contactInbox: ContactInboxModel
    message?: string
    parentMessageId?: string | null
    parentMessageCreatedAt?: Date | null
  },
) {
  if (publicReply.type === "none") {
    return
  }

  if (publicReply.type === "text" && publicReply.value) {
    let text = publicReply.value
    try {
      const variables = await contactVariableService.getAll({
        contactId: ctx.contactInbox.contactId,
        contactInbox: ctx.contactInbox,
      })
      text = await contactVariableService.replaceAll({
        text: publicReply.value,
        variables,
      })
    } catch (err) {
      logger.warn(
        { err, commentId: ctx.commentId },
        "Failed to resolve variables in reply text, sending raw text",
      )
    }
    await postPublicCommentReply({
      text,
      commentId: ctx.commentId,
      conversationId: ctx.conversationId,
      contactInboxId: ctx.contactInboxId,
      workspaceId: ctx.workspaceId,
      contactInbox: ctx.contactInbox,
      parentMessageId: ctx.parentMessageId,
      parentMessageCreatedAt: ctx.parentMessageCreatedAt,
      delay: ctx.delay,
    })
    return
  }

  if (publicReply.type === "flow" && publicReply.value) {
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
          flowId: publicReply.value,
          origin: webhookChannelOrigin(),
          commentAnchor: { commentId: ctx.commentId, replyChannel: "public" },
        },
      },
      { delay: ctx.delay, ...commentReplyRetryPolicy(ctx.contactInbox) },
    )
    return
  }

  if (publicReply.type === "AIAgent" && publicReply.value) {
    await integrationQueue.add(
      IntegrationJobAction.commentAIReply,
      {
        type: IntegrationJobAction.commentAIReply,
        data: {
          integrationType: ctx.integrationType,
          integrationIdentifier: ctx.integrationIdentifier,
          workspaceId: ctx.workspaceId,
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
          commentId: ctx.commentId,
          agentId: publicReply.value,
          replyChannel: "public",
          channelType: ctx.channelType,
          message: ctx.message,
          parentMessageId: ctx.parentMessageId ?? null,
          parentMessageCreatedAt:
            ctx.parentMessageCreatedAt?.toISOString() ?? null,
        },
      },
      { delay: ctx.delay, ...commentReplyRetryPolicy(ctx.contactInbox) },
    )
  }
}
