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
  AIJobAction,
  aiAgentQueue,
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import type { CommentAutomationChannelType } from "./channel-type"
import type { CommentAutomationDedup } from "./dedup"
import { type CommentReplyOutcome, describeFlowReply } from "./reply-outcome"

/**
 * Post a public Facebook comment reply: creates the outgoing DB message,
 * broadcasts it over realtime, and enqueues the actual send. Shared by the
 * `text` reply type (dispatched immediately, sends after `delay`) and
 * `processCommentAIReply` (already runs inside a job delayed by the caller, so
 * no further `delay` applies).
 *
 * Nothing reaches Facebook here — `sendChannelMessage` makes the Graph API call
 * in the chat worker. That is why `contentAttributes.commentAutomation` carries
 * the automation anchor: the analytics event this dispatch opened is recorded
 * `sent` optimistically, and only the chat worker knows whether the send
 * actually landed (see `settleCommentAutomationFailure`).
 */
export async function postPublicCommentReply(props: {
  text: string
  automationId: string
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
    contentAttributes: {
      replyToCommentId: props.commentId,
      commentAutomation: {
        automationId: props.automationId,
        replyChannel: "public" as const,
      },
    },
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
    ...(props.delay === undefined ? [] : [{ delay: props.delay }]),
  )
}

/**
 * Returns what was dispatched, or `null` when nothing was. The caller uses that
 * — not the automation's configuration — to decide whether to write the dedup
 * row, so a branch that quietly declines to send never counts as a reply. The
 * outcome also carries the text for the analytics event.
 */
export async function executePublicReply(
  publicReply: FBCommentReply,
  ctx: {
    auth: MessengerAuthValue
    integrationType: string
    integrationIdentifier: string
    automationId: string
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
    dedup?: CommentAutomationDedup
  },
): Promise<CommentReplyOutcome | null> {
  if (publicReply.type === "none") {
    return null
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
      automationId: ctx.automationId,
      commentId: ctx.commentId,
      conversationId: ctx.conversationId,
      contactInboxId: ctx.contactInboxId,
      workspaceId: ctx.workspaceId,
      contactInbox: ctx.contactInbox,
      parentMessageId: ctx.parentMessageId,
      parentMessageCreatedAt: ctx.parentMessageCreatedAt,
      delay: ctx.delay,
    })
    return { replyType: "text", replyText: text }
  }

  if (publicReply.type === "flow" && publicReply.value) {
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          // Deliberately the comment-anchored conversation, unlike the private
          // branch (#1063): a public flow answers on the post, and the
          // contact's next comment resolves back to this very conversation
          // through `receiveComment`, so its flow state is reachable here.
          // Do not "fix" this to the DM conversation.
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
          flowId: publicReply.value,
          origin: webhookChannelOrigin(),
          commentAnchor: { commentId: ctx.commentId, replyChannel: "public" },
        },
      },
      { delay: ctx.delay },
    )
    return {
      replyType: "flow",
      replyText: await describeFlowReply({
        workspaceId: ctx.workspaceId,
        flowId: publicReply.value,
      }),
    }
  }

  if (publicReply.type === "AIAgent" && publicReply.value) {
    await aiAgentQueue.add(
      AIJobAction.commentAIReply,
      {
        type: AIJobAction.commentAIReply,
        data: {
          automationId: ctx.automationId,
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
          commentDedup: ctx.dedup,
        },
      },
      {
        delay: ctx.delay,
        jobId: `comment-ai-reply-${ctx.automationId}-${ctx.commentId}-public`,
      },
    )
    return { replyType: "AIAgent", replyText: null }
  }

  return null
}
