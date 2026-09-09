import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import {
  contactInboxService,
  fbCommentAutomationService,
  logProviderError,
  workspaceService,
} from "@chatbotx.io/business"
import type {
  CommentAutomationReplyChannel,
  FBCommentReplyType,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import type { ErrorLogProvider } from "@chatbotx.io/utils/error-log"
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
import type { CommentAutomationChannelType } from "./channel-type"
import {
  createAttachmentInfoResolver,
  needsAttachmentInfo,
} from "./comment-attachment"
import { applyHideComments } from "./hide-comments"
import { executePrivateReply } from "./private-reply"
import { executePublicReply } from "./public-reply"
import type { CommentReplyOutcome } from "./reply-outcome"

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

  // When the customer commented, not when this job runs — `replyAfter` can put
  // minutes between the two, and every analytics panel buckets on the comment.
  const occurredAt = new Date(createdTime * 1000)

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

  // Meta allows a single comment_id-anchored DM per comment, and that budget is
  // shared by every automation matching this one comment — so it is tracked
  // across the loop, not per automation.
  let privateReplyClaimed = false

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
        occurredAt,
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
        }

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
        // Liking, hiding and parent threading all hang off the incoming
        // comment's message row. Losing it degrades all three without touching
        // the reply — which used to happen with no trace at all.
        logger.warn(
          {
            automationId: automation.id,
            commentId,
            conversationId,
            workspaceId,
          },
          "Comment automation: incoming comment message row not found, skipping like/hide and parent threading",
        )
      }

      // Built once here and threaded into every async reply job, so a job that
      // gives up without delivering anything can roll the row back — see
      // `fbCommentAutomationService.deleteDedup`.
      const dedup = {
        automationId: automation.id,
        contactId: contactInbox.contactId,
        postId,
        workspaceId,
      }

      let publicOutcome: CommentReplyOutcome | null = null
      let privateOutcome: CommentReplyOutcome | null = null

      try {
        publicOutcome = await executePublicReply(automation.publicReply, {
          auth,
          automationId: automation.id,
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
          dedup,
        })
      } catch (err) {
        logger.error(
          { err, automationId: automation.id, commentId },
          "Failed to send public reply",
        )
        await recordReplyFailure({
          workspaceId,
          automationId: automation.id,
          contactInbox,
          commentId,
          postId,
          message,
          occurredAt,
          channelType,
          replyChannel: "public",
          replyType: automation.publicReply.type,
          error: err,
        })
      }

      // Outside the try on purpose: recording is bookkeeping, and a throw here
      // must not be caught as a dispatch failure and logged a second time.
      if (publicOutcome) {
        await recordReplyEvent({
          workspaceId,
          automationId: automation.id,
          contactInbox,
          commentId,
          postId,
          message,
          occurredAt,
          replyChannel: "public",
          outcome: publicOutcome,
        })
      }

      // Meta accepts exactly one comment_id-anchored DM per comment, so a
      // second automation matching the same comment would always be rejected by
      // the Send API. Skip that dispatch here, with a reason in the log.
      if (privateReplyClaimed && willSendReply(automation.privateReply)) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          reason: "private reply already claimed for this comment",
        })
      } else {
        try {
          privateOutcome = await executePrivateReply(automation.privateReply, {
            auth,
            automationId: automation.id,
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
            createdTime,
            dedup,
          })
          privateReplyClaimed ||= privateOutcome !== null
        } catch (err) {
          logger.error(
            { err, automationId: automation.id, commentId },
            "Failed to send private reply",
          )
          await recordReplyFailure({
            workspaceId,
            automationId: automation.id,
            contactInbox,
            commentId,
            postId,
            message,
            occurredAt,
            channelType,
            replyChannel: "private",
            replyType: automation.privateReply.type,
            error: err,
          })
        }
      }

      if (privateOutcome) {
        await recordReplyEvent({
          workspaceId,
          automationId: automation.id,
          contactInbox,
          commentId,
          postId,
          message,
          occurredAt,
          replyChannel: "private",
          outcome: privateOutcome,
        })
      }

      // Dedup/count fire once dispatch is *enqueued*, not once an async reply
      // (flow, AIAgent) actually succeeds. Three rules, all deliberate:
      //
      // 1. One branch failing must NOT hold back the row when the other one
      //    dispatched — skipping it there let the contact's next comment post
      //    the successful branch a second time. A missed DM beats a duplicate.
      // 2. An automation that sends nothing (like/hide only) still gets a row,
      //    so `replyOncePerUserPerPost` keeps gating it once per user per post.
      // 3. An async job that later gives up rolls the row back itself via
      //    `deleteDedup` (see `dedup` above), so the contact is not blocked
      //    forever. `sendFlow` is the exception: a flow can fail at any step
      //    long after dispatch, and rolling back there would reopen the
      //    duplicate-reply hole.
      const anythingDispatched =
        publicOutcome !== null || privateOutcome !== null
      const anythingConfigured =
        willSendReply(automation.publicReply) ||
        willSendReply(automation.privateReply)

      if (anythingDispatched || !anythingConfigured) {
        await fbCommentAutomationService.insertDedup(dedup)
      }

      if (anythingDispatched) {
        await fbCommentAutomationService.incrementRepliesCount(automation.id)
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
 * The `ErrorLog` provider slug for a comment-automation channel. Instagram via
 * either login path is one third party as far as the workspace error log is
 * concerned — `instagramFacebook` is a connection route, not a vendor.
 */
const ERROR_LOG_PROVIDER_BY_CHANNEL: Record<
  CommentAutomationChannelType,
  ErrorLogProvider
> = {
  messenger: "messenger",
  instagram: "instagram",
  instagramFacebook: "instagram",
}

type ReplyEventContext = {
  // The job's `workspaceId`, not `automation.workspaceId`: it is the value
  // every other write in this handler is keyed by, including the dedup row.
  workspaceId: string
  automationId: string
  contactInbox: ContactInboxModel
  commentId: string
  postId: string
  message?: string
  occurredAt: Date
  replyChannel: CommentAutomationReplyChannel
}

/**
 * One analytics row per dispatched reply. An `AIAgent` reply lands here with a
 * null `replyText` — the text does not exist yet, and `processCommentAIReply`
 * settles the same row once it does.
 */
function recordReplyEvent(
  props: ReplyEventContext & { outcome: CommentReplyOutcome },
): Promise<void> {
  return commentAutomationAnalyticsService.recordEvent({
    workspaceId: props.workspaceId,
    automationId: props.automationId,
    contactId: props.contactInbox.contactId,
    postId: props.postId,
    commentId: props.commentId,
    commentText: props.message ?? null,
    replyChannel: props.replyChannel,
    replyType: props.outcome.replyType,
    replyText: props.outcome.replyText,
    status: "sent",
    occurredAt: props.occurredAt,
  })
}

/**
 * A dispatch that threw is recorded twice on purpose: once on the automation's
 * own analytics timeline, and once on the workspace-wide Error Logs page via
 * `logProviderError` — the same pairing `story-reply-automation` already does.
 *
 * Swallows its own failures. This runs inside the reply branch's catch block,
 * and the code after that block still has to write the dedup row: letting a
 * bookkeeping error escape would skip it, and the contact's next comment would
 * then get the *other* branch's reply a second time. Recording a failure must
 * never be able to cause one.
 */
async function recordReplyFailure(
  props: ReplyEventContext & {
    channelType: CommentAutomationChannelType
    replyType: FBCommentReplyType
    error: unknown
  },
): Promise<void> {
  const detail =
    props.error instanceof Error ? props.error.message : String(props.error)

  try {
    await Promise.all([
      commentAutomationAnalyticsService.recordEvent({
        workspaceId: props.workspaceId,
        automationId: props.automationId,
        contactId: props.contactInbox.contactId,
        postId: props.postId,
        commentId: props.commentId,
        commentText: props.message ?? null,
        replyChannel: props.replyChannel,
        replyType: props.replyType,
        replyText: null,
        status: "failed",
        errorDetail: detail,
        occurredAt: props.occurredAt,
      }),
      logProviderError({
        provider: ERROR_LOG_PROVIDER_BY_CHANNEL[props.channelType],
        workspaceId: props.workspaceId,
        contactId: props.contactInbox.contactId,
        error: props.error,
      }),
    ])
  } catch (err) {
    logger.error(
      {
        err,
        automationId: props.automationId,
        commentId: props.commentId,
        replyChannel: props.replyChannel,
      },
      "Failed to record a comment automation reply failure",
    )
  }
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
