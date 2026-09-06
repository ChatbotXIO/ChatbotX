import { conversationService } from "@chatbotx.io/business"
import type {
  ChannelType,
  FBCommentReply,
} from "@chatbotx.io/database/partials"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  type InstagramAuthValue,
  sendPrivateReply as sendInstagramLoginPrivateReply,
} from "@chatbotx.io/integration-instagram"
import {
  type InstagramAuthValue as InstagramFacebookAuthValue,
  sendPrivateReply as sendInstagramFacebookPrivateReply,
} from "@chatbotx.io/integration-instagram-facebook"
import {
  type MessengerAuthValue,
  sendPrivateReply,
} from "@chatbotx.io/integration-messenger"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import type { CommentAutomationChannelType } from "./channel-type"

export type PrivateReplyAuth =
  | MessengerAuthValue
  | InstagramAuthValue
  | InstagramFacebookAuthValue

export const PRIVATE_REPLY_TEXT_SENDERS: Record<
  CommentAutomationChannelType,
  (auth: PrivateReplyAuth, commentId: string, text: string) => Promise<unknown>
> = {
  messenger: (auth, commentId, text) =>
    sendPrivateReply(auth as MessengerAuthValue, commentId, text),
  // Instagram Login sends the private DM through the me/messages endpoint,
  // addressing the commenter by comment id.
  instagram: (auth, commentId, text) =>
    sendInstagramLoginPrivateReply(auth as InstagramAuthValue, commentId, text),
  // Instagram via Facebook Login sends the private DM through the
  // {igId}/messages endpoint (Page/Business-asset token), addressing the
  // commenter by comment id.
  instagramFacebook: (auth, commentId, text) =>
    sendInstagramFacebookPrivateReply(
      auth as InstagramFacebookAuthValue,
      commentId,
      text,
    ),
}

/**
 * A comment anchors its conversation to the post (`Conversation.sourceId =
 * postId`), but the contact's DM replies always land on the DM conversation
 * (`sourceId IS NULL`). Starting the flow on the comment conversation parks its
 * state — `currentStep` and `additionalAttributes.challenge` — where no reply
 * can reach it, so the flow never advances past its first waiting step and
 * nothing errors (#1063). Resolve the DM conversation instead; `commentAnchor`
 * rides the job separately and still delivers the first message through the
 * comment_id-anchored Send API.
 *
 * The `sourceId: null` fallback covers a contact whose first ever interaction
 * is this comment. It holds because every comment-automation channel
 * (messenger, instagram, instagramFacebook) keys its DM conversation with a
 * null sourceId — revisit it if a channel like TikTok, whose DM lives on a
 * non-null sourceId, ever grows comment automation.
 */
async function resolveDirectMessageConversationId(ctx: {
  commentId: string
  conversationId: string
  contactInbox: ContactInboxModel
  workspaceId: string
}): Promise<string> {
  try {
    const existing = await conversationService.findDMByContact({
      workspaceId: ctx.workspaceId,
      contactId: ctx.contactInbox.contactId,
      channel: ctx.contactInbox.channel as ChannelType,
    })
    if (existing) {
      return existing.id
    }

    const created = await conversationService.findOrCreate({
      workspaceId: ctx.workspaceId,
      contactId: ctx.contactInbox.contactId,
      sourceId: null,
    })
    return created.id
  } catch (err) {
    // Fall back to the pre-#1063 behaviour (flow starts, on the wrong
    // conversation) rather than throwing: the caller would mark the dispatch
    // failed, skip the dedup row, and a job retry would post the public reply
    // a second time.
    logger.warn(
      { err, commentId: ctx.commentId, conversationId: ctx.conversationId },
      "Failed to resolve the DM conversation for a comment-triggered flow, falling back to the comment conversation",
    )
    return ctx.conversationId
  }
}

export async function executePrivateReply(
  privateReply: FBCommentReply,
  ctx: {
    auth: PrivateReplyAuth
    integrationType: string
    integrationIdentifier: string
    commentId: string
    channelType: CommentAutomationChannelType
    conversationId: string
    contactInboxId: string
    contactInbox: ContactInboxModel
    workspaceId: string
    delay: number
    message?: string
  },
) {
  if (privateReply.type === "none") {
    return
  }

  if (privateReply.type === "text" && privateReply.value) {
    let text = privateReply.value
    try {
      const variables = await contactVariableService.getAll({
        contactId: ctx.contactInbox.contactId,
        contactInbox: ctx.contactInbox,
      })
      text = await contactVariableService.replaceAll({
        text: privateReply.value,
        variables,
      })
    } catch (err) {
      logger.warn(
        { err, commentId: ctx.commentId },
        "Failed to resolve variables in reply text, sending raw text",
      )
    }

    await PRIVATE_REPLY_TEXT_SENDERS[ctx.channelType](
      ctx.auth,
      ctx.commentId,
      text,
    )
    return
  }

  if (privateReply.type === "flow" && privateReply.value) {
    // The flow's *state* lives on the DM conversation, where the contact's
    // replies arrive; only its first message's *delivery* is anchored to the
    // comment. See resolveDirectMessageConversationId.
    const conversationId = await resolveDirectMessageConversationId(ctx)

    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId,
          contactInboxId: ctx.contactInboxId,
          flowId: privateReply.value,
          origin: webhookChannelOrigin(),
          // The anchor lets the channel deliver the flow's first message via
          // Meta's comment_id-anchored Send API (7-day comment window) instead
          // of a normal DM gated by the 24-hour messaging window. Supported on
          // all comment-automation channels (messenger, instagram,
          // instagramFacebook).
          commentAnchor: {
            commentId: ctx.commentId,
            replyChannel: "private" as const,
          },
        },
      },
      { delay: ctx.delay },
    )
    return
  }

  if (privateReply.type === "AIAgent" && privateReply.value) {
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
          agentId: privateReply.value,
          replyChannel: "private",
          channelType: ctx.channelType,
          message: ctx.message,
        },
      },
      {
        delay: ctx.delay,
      },
    )
  }
}
