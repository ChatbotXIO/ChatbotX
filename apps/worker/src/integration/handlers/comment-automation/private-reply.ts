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
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
          flowId: privateReply.value,
          origin: webhookChannelOrigin(),
          ...(ctx.channelType === "messenger"
            ? {
                commentAnchor: {
                  commentId: ctx.commentId,
                  replyChannel: "private" as const,
                },
              }
            : {}),
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
