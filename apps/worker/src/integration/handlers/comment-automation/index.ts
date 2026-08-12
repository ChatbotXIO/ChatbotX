import {
  contactInboxService,
  fbCommentAutomationService,
  workspaceService,
} from "@chatbotx.io/business"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type { ConversationModel } from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import {
  ChatJobAction,
  chatQueue,
  type IntegrationJobProcessCommentAutomation,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { integrationService } from "../../../services/integrations"
import {
  computeDelayMs,
  isCommentReply,
  matchKeywords,
  matchPost,
  willSendReply,
} from "./automation-matching"
import {
  type CommentAutomationChannelType,
  supportsCommentLike,
} from "./channel-type"
import {
  createAttachmentInfoResolver,
  needsAttachmentInfo,
} from "./comment-attachment"
import {
  applyHideComments,
  hasHideCommentAction,
  supportsHideComments,
} from "./hide-comments"
import { executePrivateReply, supportsPrivateReply } from "./private-reply"
import { executePublicReply } from "./public-reply"

export { isCommentReply } from "./automation-matching"

export async function processCommentAutomation(
  data: IntegrationJobProcessCommentAutomation["data"],
): Promise<void> {
  const {
    integrationType,
    integrationIdentifier,
    workspaceId,
    conversationId,
    contactInboxId,
    commentId,
    postId,
    parentId,
    fromId: _fromId,
    message,
    createdTime,
  } = data

  const { integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )
  const auth = integrationRow.auth as MessengerAuthValue

  const contactInbox = await contactInboxService.findBy({
    where: { id: contactInboxId },
  })
  if (!contactInbox) {
    logger.warn(
      { contactInboxId, workspaceId, commentId },
      "Comment automation skipped: contactInbox not found",
    )
    return
  }

  const channelType = integrationType as CommentAutomationChannelType
  const automations = await fbCommentAutomationService.findActiveAutomations({
    workspaceId,
    channelType,
  })

  const workspace = await workspaceService.findById({ id: workspaceId })

  const resolveAttachmentInfo = createAttachmentInfoResolver({
    channelType,
    workspaceId,
    commentId,
    integrationRow,
    auth,
  })

  for (const automation of automations) {
    try {
      if (
        !fbCommentAutomationService.isWithinSchedule(
          automation,
          workspace.timezone,
        )
      ) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          reason: "outside schedule",
        })
        continue
      }
      if (!matchPost(automation.post, postId)) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          reason: "post does not match",
        })
        continue
      }
      if (
        automation.options.ignoreCommentReplies &&
        isCommentReply(parentId, postId)
      ) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          reason: "comment is a reply",
        })
        continue
      }
      if (
        !matchKeywords(
          automation.includeKeywords,
          automation.excludeKeywords,
          message,
        )
      ) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          reason: "keywords do not match",
        })
        continue
      }

      if (automation.options.replyToNewContactsOnly) {
        const priorCount =
          await fbCommentAutomationService.getPriorContactInboxCount({
            contactId: contactInbox.contactId,
          })
        if (priorCount > 1) {
          logAutomationSkipped({
            automationId: automation.id,
            commentId,
            postId,
            workspaceId,
            reason: "contact is not new",
          })
          continue
        }
      }

      if (automation.options.replyOncePerUserPerPost) {
        const existing = await fbCommentAutomationService.findDedup({
          automationId: automation.id,
          contactId: contactInbox.contactId,
          postId,
        })
        if (existing) {
          logAutomationSkipped({
            automationId: automation.id,
            commentId,
            postId,
            workspaceId,
            reason: "already replied to this user on this post",
          })
          continue
        }
      }

      if (!automation.options.replyToUsersWhoCommentedOnOtherPosts) {
        const repliedElsewhere =
          await fbCommentAutomationService.hasRepliedOnOtherPost({
            automationId: automation.id,
            contactId: contactInbox.contactId,
            postId,
          })
        if (repliedElsewhere) {
          logAutomationSkipped({
            automationId: automation.id,
            commentId,
            postId,
            workspaceId,
            reason: "user already engaged on another post",
          })
          continue
        }
      }

      const delay = computeDelayMs(automation.replyAfter)

      const messageRepo = await createMessageRepository()
      const dbMessage = await messageRepo.findBySourceId(
        commentId,
        conversationId,
        workspaceId,
        new Date(createdTime * 1000),
      )

      let parentMessageId: string | null = null
      let parentMessageCreatedAt: Date | null = null

      if (dbMessage) {
        parentMessageId = dbMessage.id
        parentMessageCreatedAt = dbMessage.createdAt
        const conversationRef = {
          id: conversationId,
          workspaceId,
        } as ConversationModel
        const messageRef = { id: dbMessage.id, createdAt: dbMessage.createdAt }

        if (automation.options.likeUserComment) {
          if (supportsCommentLike(channelType)) {
            chatQueue
              .add(ChatJobAction.changeChannelMessageState, {
                type: ChatJobAction.changeChannelMessageState,
                data: {
                  conversation: conversationRef,
                  contactInbox,
                  message: messageRef,
                  liked: true,
                },
              })
              .catch((err: unknown) =>
                logger.error(
                  { err, automationId: automation.id, commentId },
                  "Failed to like comment",
                ),
              )
          } else {
            logUnsupportedCapability({
              automationId: automation.id,
              commentId,
              capability: "like comment unsupported",
            })
          }
        }

        if (hasHideCommentAction(automation.hideComments)) {
          if (supportsHideComments(channelType)) {
            const { hasImage, hasVideo } = needsAttachmentInfo(
              automation.hideComments,
            )
              ? await resolveAttachmentInfo()
              : { hasImage: false, hasVideo: false }

            applyHideComments(automation.hideComments, commentId, message, {
              conversation: conversationRef,
              contactInbox,
              messageId: dbMessage.id,
              messageCreatedAt: dbMessage.createdAt,
              hasImage,
              hasVideo,
            }).catch((err: unknown) =>
              logger.error(
                { err, automationId: automation.id, commentId },
                "Failed to apply hide comments",
              ),
            )
          } else {
            if (needsAttachmentInfo(automation.hideComments)) {
              logUnsupportedCapability({
                automationId: automation.id,
                commentId,
                capability: "attachment lookup unsupported",
              })
            }
            logUnsupportedCapability({
              automationId: automation.id,
              commentId,
              capability: "hide or unhide comment unsupported",
            })
          }
        }
      }

      let dispatchFailed = false
      // Tracks whether a reply actually went out, as opposed to merely being
      // configured. Only consulted when a configured reply was skipped for
      // lack of channel support (see `privateReplySkipped` below).
      let dispatchedReply = false

      try {
        await executePublicReply(automation.publicReply, {
          auth,
          integrationType,
          integrationIdentifier,
          commentId,
          channelType,
          conversationId,
          contactInboxId,
          delay,
          workspaceId,
          contactInbox,
          message,
          parentMessageId,
          parentMessageCreatedAt,
        })
        if (willSendReply(automation.publicReply)) {
          dispatchedReply = true
        }
      } catch (err) {
        logger.error(
          { err, automationId: automation.id, commentId },
          "Failed to send public reply",
        )
        if (willSendReply(automation.publicReply)) {
          dispatchFailed = true
        }
      }

      // A private reply configured on a channel without a private-reply API
      // (Threads) can never be delivered — report it instead of dispatching.
      const privateReplySkipped =
        willSendReply(automation.privateReply) &&
        !supportsPrivateReply(channelType)

      if (privateReplySkipped) {
        logUnsupportedCapability({
          automationId: automation.id,
          commentId,
          capability: "private reply unsupported",
        })
      } else {
        try {
          await executePrivateReply(automation.privateReply, {
            auth,
            integrationType,
            integrationIdentifier,
            commentId,
            channelType,
            conversationId,
            contactInboxId,
            contactInbox,
            workspaceId,
            delay,
            message,
          })
          if (willSendReply(automation.privateReply)) {
            dispatchedReply = true
          }
        } catch (err) {
          logger.error(
            { err, automationId: automation.id, commentId },
            "Failed to send private reply",
          )
          if (willSendReply(automation.privateReply)) {
            dispatchFailed = true
          }
        }
      }

      // Dedup/count fire once dispatch is *enqueued*, not once an async reply
      // (flow, AIAgent) actually succeeds — a later failure inside that job
      // (e.g. agent misconfigured, no auto-reply-enabled provider) still
      // counts as "replied" here and won't be retried. Fixing this properly
      // requires threading the dedup write into the async job itself for
      // every async-dispatch reply type, which is out of scope for now.
      if (!dispatchFailed) {
        // A reply the channel cannot deliver must not consume the
        // once-per-user-per-post dedup slot or bump the replies counter —
        // nothing was sent. When no configured reply was skipped this way the
        // accounting is unchanged: dedup always, count whenever a reply was
        // configured.
        const countableReply = privateReplySkipped
          ? dispatchedReply
          : willSendReply(automation.publicReply) ||
            willSendReply(automation.privateReply)
        const shouldWriteDedup = privateReplySkipped ? dispatchedReply : true

        if (shouldWriteDedup) {
          await fbCommentAutomationService.insertDedup({
            automationId: automation.id,
            contactId: contactInbox.contactId,
            postId,
            workspaceId,
          })
        }

        if (countableReply) {
          await fbCommentAutomationService.incrementRepliesCount(automation.id)
        }
      }
    } catch (err) {
      logger.error(
        { err, automationId: automation.id, commentId, workspaceId },
        "Failed to process comment automation",
      )
    }
  }
}

/**
 * A channel-level capability the automation asked for but the channel does not
 * have (Threads has no like/hide/private-reply APIs). Logged per automation so
 * a silently partial run is still traceable, and deliberately not an error:
 * the rest of the automation still runs.
 */
const logUnsupportedCapability = ({
  automationId,
  commentId,
  capability,
}: {
  automationId: string
  commentId: string
  capability: string
}) => {
  logger.info(
    { automationId, commentId, capability },
    "Comment automation capability unsupported",
  )
}

const logAutomationSkipped = ({
  automationId,
  commentId,
  postId,
  workspaceId,
  reason,
}: {
  automationId: string
  commentId: string
  postId: string
  workspaceId: string
  reason: string
}) => {
  logger.info(
    { automationId, commentId, postId, workspaceId, reason },
    "Comment automation skipped",
  )
}
