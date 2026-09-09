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
 * Each bail-out also settles the analytics event the dispatcher opened with a
 * null `replyText` (see `CommentReplyOutcome`), turning it into a `failed` row
 * carrying the same reason. Without this, an AI reply that silently produced
 * nothing would show on the analytics page as a successful reply — the exact
 * class of failure the Error Logs panel exists to surface.
 */
async function abandonAIReply(props: {
  data: AIJobCommentAIReply["data"]
  reason: string
}): Promise<void> {
  await Promise.all([
    rollbackCommentDedup({
      dedup: props.data.commentDedup,
      commentId: props.data.commentId,
      reason: props.reason,
    }),
    commentAutomationAnalyticsService.settleEvent({
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
): Promise<void> {
  if (!data.message?.trim()) {
    // Image/sticker-only comment: nothing for the agent to answer.
    await abandonAIReply({ data, reason: "comment has no text" })
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
    await abandonAIReply({ data, reason: "workspace outside active hours" })
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
    await abandonAIReply({ data, reason: "agent not found" })
    return
  }

  if (!contactInbox) {
    logger.warn(
      { contactInboxId: data.contactInboxId, commentId: data.commentId },
      "comment AI reply skipped: contactInbox not found",
    )
    await abandonAIReply({ data, reason: "contactInbox not found" })
    return
  }

  if (!conversation) {
    logger.warn(
      { conversationId: data.conversationId, commentId: data.commentId },
      "comment AI reply skipped: conversation not found",
    )
    await abandonAIReply({ data, reason: "conversation not found" })
    return
  }

  const generated = await generateAIReplyText({
    conversation,
    contactInbox,
    messages: [{ role: "user", content: data.message }],
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
    await abandonAIReply({ data, reason: "agent produced no text" })
    return
  }

  if (data.replyChannel === "public") {
    await postPublicCommentReply({
      text: generated.text,
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
    await settleAIReplySent({ data, text: generated.text })
    return
  }

  // Private DM.
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
