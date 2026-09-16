import { broadcastToWorkspaceParty } from "@chatbotx.io/business"
import {
  type FBCommentReply,
  resolveReplyTexts,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import { COMMENT_AUTOMATION_PAYLOAD_TYPE } from "@chatbotx.io/flow-config"
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
 * Gap between consecutive public comment replies of one automation. Long
 * enough that the queue's parallel workers cannot reorder them, short enough
 * that the set still reads as one answer.
 */
const PUBLIC_REPLY_SPACING_MS = 3000

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

  if (publicReply.type === "text") {
    const texts = resolveReplyTexts(publicReply)
    if (texts.length === 0) {
      return null
    }

    // Variables are resolved once for the whole set — they describe the
    // contact, not the message, and one lookup per text would be N round trips
    // for identical data.
    let variables: Awaited<
      ReturnType<typeof contactVariableService.getAll>
    > | null = null
    try {
      variables = await contactVariableService.getAll({
        contactId: ctx.contactInbox.contactId,
        contactInbox: ctx.contactInbox,
      })
    } catch (err) {
      logger.warn(
        { err, commentId: ctx.commentId },
        "Failed to resolve variables in reply text, sending raw text",
      )
    }

    const sent: string[] = []
    for (const [index, rawText] of texts.entries()) {
      let text = rawText
      if (variables) {
        try {
          text = await contactVariableService.replaceAll({
            text: rawText,
            variables,
          })
        } catch (err) {
          logger.warn(
            { err, commentId: ctx.commentId },
            "Failed to resolve variables in reply text, sending raw text",
          )
        }
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
        // Staggered, because nothing downstream preserves order: the chat
        // queue runs `concurrency: 5` with no limiter, so N jobs sharing one
        // delay are picked up in parallel and the replies land under the
        // comment in whatever order Facebook happens to accept them. The
        // spacing doubles as breathing room for Meta's spam heuristics.
        delay: ctx.delay + index * PUBLIC_REPLY_SPACING_MS,
      })
      sent.push(text)
    }

    // One outcome for the set: N texts are many messages but ONE reply, the
    // same rule a `flow` reply already follows. The joined text is what the
    // analytics "Bot replies" table groups on, so it has to be everything the
    // customer saw.
    return { replyType: "text", replyText: sent.join("\n") }
  }

  if (publicReply.type === "flow" && publicReply.value) {
    const flowId = publicReply.value

    return {
      replyType: "flow",
      replyText: await describeFlowReply({
        workspaceId: ctx.workspaceId,
        flowId,
      }),
      // Enqueued by the caller once the analytics row exists — see `dispatch`
      // on `CommentReplyOutcome`.
      dispatch: async () => {
        await integrationQueue.add(
          IntegrationJobAction.sendFlow,
          {
            type: IntegrationJobAction.sendFlow,
            data: {
              // Deliberately the comment-anchored conversation, unlike the
              // private branch (#1063): a public flow answers on the post, and
              // the contact's next comment resolves back to this very
              // conversation through `receiveComment`, so its flow state is
              // reachable here. Do not "fix" this to the DM conversation.
              conversationId: ctx.conversationId,
              contactInboxId: ctx.contactInboxId,
              flowId,
              origin: webhookChannelOrigin(),
              // A public reply posts comments, which carry no buttons — but
              // the public anchor is lost across a Wait step, and every step
              // after that one sends as a normal DM, buttons included.
              // `metadata` survives the wait, so those stay attributed.
              metadata: {
                type: COMMENT_AUTOMATION_PAYLOAD_TYPE,
                commentAutomationId: ctx.automationId,
                commentId: ctx.commentId,
                replyChannel: "public" as const,
              },
              commentAnchor: {
                commentId: ctx.commentId,
                replyChannel: "public",
                // See the private branch: carries the automation into the flow
                // runner so delivery can be reported back.
                automationId: ctx.automationId,
              },
            },
          },
          { delay: ctx.delay, ...commentReplyRetryPolicy(ctx.contactInbox) },
        )
      },
    }
  }

  if (publicReply.type === "AIAgent" && publicReply.value) {
    const agentId = publicReply.value

    return {
      replyType: "AIAgent",
      replyText: null,
      // Deferred for the same reason the flow branch is: `processCommentAIReply`
      // settles its outcome onto the analytics row the caller writes next.
      dispatch: async () => {
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
              agentId,
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
            ...commentReplyRetryPolicy(ctx.contactInbox),
          },
        )
      },
    }
  }

  return null
}
