import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import {
  aiAgentService,
  contactInboxService,
  conversationService,
  workspaceService,
} from "@chatbotx.io/business"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type { AIJobCommentAIReply } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { integrationService } from "../../../services/integrations"
import { IntegrationNotFoundError } from "../../../services/orphaned-integration-cleanup"
import { generateAIReplyText } from "../automated-response/replies"
import { rollbackCommentDedup } from "./dedup"
import {
  PRIVATE_REPLY_TEXT_SENDERS,
  type PrivateReplyAuth,
} from "./private-reply"
import { postPublicCommentReply } from "./public-reply"

/**
 * Generate an AI agent reply for a Facebook comment and deliver it on the
 * requested channel: a public comment reply (message with `type: "comment"` +
 * `replyToCommentId`) or a private DM. The generation is done here (not through
 * the DM auto-responder pipeline) so the selected agent and the public/private
 * channel are both honoured. Runs as its own delayed job so the AI call never
 * blocks the comment-automation loop.
 *
 * Every bail-out below releases the dedup row the dispatcher wrote when it
 * enqueued this job (`data.commentDedup`) — otherwise a comment that never got
 * an answer would still count as replied and `replyOncePerUserPerPost` would
 * block the contact for good. A *thrown* failure deliberately keeps the row:
 * BullMQ retries the job, and releasing it mid-retry would let the contact's
 * next comment trigger a second reply.
 *
 * Each bail-out also closes out the analytics event the dispatcher opened with
 * a null `replyText` (see `CommentReplyOutcome`), and `outcome` decides how:
 *
 * - `failed` — something went wrong the workspace needs to see (missing agent,
 *   agent produced nothing). The row becomes a `failed` one carrying the
 *   reason. Without this, an AI reply that silently produced nothing would show
 *   on the analytics page as a successful reply — the exact class of failure
 *   the Error Logs panel exists to surface.
 * - `skipped` — the automation deliberately declined (outside business hours,
 *   nothing to answer). The row is DELETED. `FBCommentAutomationEvent` only
 *   counts work the automation actually attempted (see the partial's docblock),
 *   so a skip must leave no trace rather than one Error Logs row per off-hours
 *   comment.
 */
async function abandonAIReply(props: {
  data: AIJobCommentAIReply["data"]
  reason: string
  outcome: "skipped" | "failed"
}): Promise<void> {
  await Promise.all([
    rollbackCommentDedup({
      dedup: props.data.commentDedup,
      commentId: props.data.commentId,
      reason: props.reason,
    }),
    props.outcome === "skipped"
      ? commentAutomationAnalyticsService.discardEvent({
          automationId: props.data.automationId,
          commentId: props.data.commentId,
          replyChannel: props.data.replyChannel,
        })
      : commentAutomationAnalyticsService.settleEvent({
          automationId: props.data.automationId,
          commentId: props.data.commentId,
          replyChannel: props.data.replyChannel,
          status: "failed",
          errorDetail: props.reason,
        }),
  ])
}

export async function processCommentAIReply(
  data: AIJobCommentAIReply["data"],
  // Whether rethrowing from here leaves BullMQ another attempt. Defaults to
  // terminal so an unaware caller records the failure rather than losing it —
  // same contract as `sendMessageToChannel`.
  willRetryOnThrow = false,
): Promise<void> {
  // Filled in as soon as the agent produces text, so a failure in the *send*
  // still records what the customer was supposed to receive while a failure
  // before generation records no text at all.
  const generatedTextRef: { text?: string } = {}

  try {
    await generateAndDeliverAIReply(data, generatedTextRef)
  } catch (err) {
    // Rethrown either way so BullMQ keeps its retry and the dedup row stays put
    // (see the docblock above). Only a terminal failure records the row —
    // otherwise one dead-lettering job writes an Error Logs row per attempt.
    //
    // The whole body is covered, not just the send: a lookup or a generation
    // that throws (a bad provider key reaching `createReplyModel`, a variable
    // lookup failing) used to leave the row at `sent` with a null `replyText`
    // forever, which is the exact failure class `abandonAIReply` exists for.
    if (isTerminalAIReplyFailure(err, willRetryOnThrow)) {
      await settleAIReplyFailed({
        data,
        text: generatedTextRef.text,
        error: err,
      })
    }
    throw err
  }
}

/**
 * BullMQ will not run this job again after the current attempt.
 *
 * `willRetryOnThrow` alone is not enough. `runWithOrphanedIntegrationCleanup`
 * turns an `IntegrationNotFoundError` into a BullMQ `UnrecoverableError`, but it
 * wraps this handler from the *outside* (`ai-agent/worker.ts`), so the catch
 * here only ever sees the original error — and an attempt that is nominally
 * "1 of 2" is in fact the last one.
 */
function isTerminalAIReplyFailure(
  error: unknown,
  willRetryOnThrow: boolean,
): boolean {
  return !willRetryOnThrow || error instanceof IntegrationNotFoundError
}

/** The body of `processCommentAIReply`, so one catch covers every step. */
async function generateAndDeliverAIReply(
  data: AIJobCommentAIReply["data"],
  generatedTextRef: { text?: string },
): Promise<void> {
  const message = data.message?.trim()
  if (!message) {
    // Image/sticker-only comment: nothing for the agent to answer.
    await abandonAIReply({
      data,
      reason: "comment has no text",
      outcome: "skipped",
    })
    return
  }

  const [workspace, agent, contactInbox, conversation] = await Promise.all([
    workspaceService.findById({ id: data.workspaceId }),
    aiAgentService.findBy({
      where: { id: data.agentId, workspaceId: data.workspaceId },
    }),
    contactInboxService.findBy({ where: { id: data.contactInboxId } }),
    conversationService.findBy({ where: { id: data.conversationId } }),
  ])

  if (!workspaceService.isActiveNow(workspace)) {
    logger.info(
      { workspaceId: data.workspaceId, commentId: data.commentId },
      "comment AI reply skipped: workspace outside active hours",
    )
    // A deliberate business-hours skip, not a failure: no event row survives.
    await abandonAIReply({
      data,
      reason: "workspace outside active hours",
      outcome: "skipped",
    })
    return
  }

  if (!agent) {
    logger.warn(
      {
        agentId: data.agentId,
        workspaceId: data.workspaceId,
        commentId: data.commentId,
      },
      "comment AI reply skipped: agent not found",
    )
    await abandonAIReply({
      data,
      reason: "agent not found",
      outcome: "failed",
    })
    return
  }

  if (!contactInbox) {
    logger.warn(
      { contactInboxId: data.contactInboxId, commentId: data.commentId },
      "comment AI reply skipped: contactInbox not found",
    )
    await abandonAIReply({
      data,
      reason: "contactInbox not found",
      outcome: "failed",
    })
    return
  }

  if (!conversation) {
    logger.warn(
      { conversationId: data.conversationId, commentId: data.commentId },
      "comment AI reply skipped: conversation not found",
    )
    await abandonAIReply({
      data,
      reason: "conversation not found",
      outcome: "failed",
    })
    return
  }

  const generated = await generateAIReplyText({
    conversation,
    contactInbox,
    messages: [{ role: "user", content: message }],
    aiAgent: agent,
  })
  if (!generated?.text) {
    logger.info(
      {
        agentId: data.agentId,
        commentId: data.commentId,
        workspaceId: data.workspaceId,
      },
      "comment AI reply skipped: no text produced",
    )
    await abandonAIReply({
      data,
      reason: "agent produced no text",
      outcome: "failed",
    })
    return
  }
  generatedTextRef.text = generated.text

  if (data.replyChannel === "public") {
    // Only writes the message row and enqueues the send — the Graph API call
    // happens in the chat worker, which settles this same event row itself if
    // the send terminally fails (`settleCommentAutomationFailure`). A throw here
    // is therefore the local half only.
    await postPublicCommentReply({
      text: generated.text,
      automationId: data.automationId,
      commentId: data.commentId,
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
      workspaceId: data.workspaceId,
      contactInbox,
      parentMessageId: data.parentMessageId,
      parentMessageCreatedAt: data.parentMessageCreatedAt
        ? new Date(data.parentMessageCreatedAt)
        : null,
    })
  } else {
    // Private DM: sent inline, so a throw here IS the delivery failure.
    const { integrationRow } =
      await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
        data.integrationType as IntegrationType,
        data.integrationIdentifier,
      )

    await PRIVATE_REPLY_TEXT_SENDERS[data.channelType](
      integrationRow.auth as PrivateReplyAuth,
      data.commentId,
      generated.text,
    )
  }

  await settleAIReplySent({ data, text: generated.text })
}

/** Lands the generated text on the event row the dispatcher opened. */
function settleAIReplySent(props: {
  data: AIJobCommentAIReply["data"]
  text: string
}): Promise<void> {
  return commentAutomationAnalyticsService.settleEvent({
    automationId: props.data.automationId,
    commentId: props.data.commentId,
    replyChannel: props.data.replyChannel,
    status: "sent",
    replyText: props.text,
  })
}

/**
 * A step that threw on the last attempt.
 *
 * `text` is omitted when the failure happened before generation produced
 * anything — `settleEvent` is a partial update, so the row keeps its null
 * `replyText` instead of being handed a fabricated empty one. When there IS
 * text, it is written: an Error Logs row showing what the customer never
 * received beats one with an empty reply, which reads as "the agent produced
 * nothing" and hides that generation actually succeeded.
 */
function settleAIReplyFailed(props: {
  data: AIJobCommentAIReply["data"]
  text?: string
  error: unknown
}): Promise<void> {
  return commentAutomationAnalyticsService.settleEvent({
    automationId: props.data.automationId,
    commentId: props.data.commentId,
    replyChannel: props.data.replyChannel,
    status: "failed",
    ...(props.text === undefined ? {} : { replyText: props.text }),
    errorDetail:
      props.error instanceof Error ? props.error.message : String(props.error),
  })
}
