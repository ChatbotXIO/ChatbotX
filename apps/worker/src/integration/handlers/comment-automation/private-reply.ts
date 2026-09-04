import type { FBCommentReply } from "@chatbotx.io/database/partials"
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

export type PrivateReplyTextSender = (
  auth: PrivateReplyAuth,
  commentId: string,
  text: string,
) => Promise<unknown>

/**
 * How each channel delivers the private (DM) half of a comment automation.
 * `null` means the channel has no private-reply API at all — the single source
 * of truth for `supportsPrivateReply`, so a channel can never be "supported"
 * without a sender to back it.
 */
export const PRIVATE_REPLY_TEXT_SENDERS: Record<
  CommentAutomationChannelType,
  PrivateReplyTextSender | null
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
  // The Threads API has no `private_replies` (or any DM) endpoint: a Threads
  // comment can only be answered publicly. Every private-reply path — text,
  // flow and AIAgent alike — therefore skips on Threads.
  threads: null,
}

/** Whether the channel can answer a comment with a private DM. */
export function supportsPrivateReply(
  channelType: CommentAutomationChannelType,
): boolean {
  return PRIVATE_REPLY_TEXT_SENDERS[channelType] !== null
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

  const sendText = PRIVATE_REPLY_TEXT_SENDERS[ctx.channelType]
  if (!sendText) {
    // Channel has no private-reply API (Threads). Callers log the skip with
    // the automation id; this guard keeps flow/AIAgent dispatch from enqueuing
    // a job whose reply could never be delivered.
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

    await sendText(ctx.auth, ctx.commentId, text)
    return
  }

  if (privateReply.type === "flow" && privateReply.value) {
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: ctx.conversationId,
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
