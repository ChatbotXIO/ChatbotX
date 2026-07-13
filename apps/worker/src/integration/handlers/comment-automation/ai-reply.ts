import {
  aiAgentService,
  contactInboxService,
  conversationService,
  workspaceService,
} from "@chatbotx.io/business"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
  type MessengerAuthValue,
  sendPrivateReply,
} from "@chatbotx.io/integration-messenger"
import type { IntegrationJobCommentAIReply } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { integrationService } from "../../../services/integrations"
import { generateAIReplyText } from "../automated-response/replies"
import { postPublicCommentReply } from "."

/**
 * Generate an AI agent reply for a Facebook comment and deliver it on the
 * requested channel: a public comment reply (message with `type: "comment"` +
 * `replyToCommentId`) or a private DM. The generation is done here (not through
 * the DM auto-responder pipeline) so the selected agent and the public/private
 * channel are both honoured. Runs as its own delayed job so the AI call never
 * blocks the comment-automation loop.
 */
export async function processCommentAIReply(
  data: IntegrationJobCommentAIReply["data"],
): Promise<void> {
  if (!data.message?.trim()) {
    // Image/sticker-only comment: nothing for the agent to answer.
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
    return
  }

  if (!contactInbox) {
    logger.warn(
      { contactInboxId: data.contactInboxId, commentId: data.commentId },
      "comment AI reply skipped: contactInbox not found",
    )
    return
  }

  if (!conversation) {
    logger.warn(
      { conversationId: data.conversationId, commentId: data.commentId },
      "comment AI reply skipped: conversation not found",
    )
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
    return
  }

  // Private DM. Instagram private DM is out of scope (no private_replies API),
  // same as the private text branch.
  if (data.channelType === "messenger") {
    const { integrationRow } =
      await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
        data.integrationType as IntegrationType,
        data.integrationIdentifier,
      )
    await sendPrivateReply(
      integrationRow.auth as MessengerAuthValue,
      data.commentId,
      generated.text,
    )
  }
}
