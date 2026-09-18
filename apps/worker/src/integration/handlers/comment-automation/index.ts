import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import {
  commentAutomationService,
  contactInboxService,
  logProviderError,
  workspaceService,
} from "@chatbotx.io/business"
import type {
  CommentAutomationMissReason,
  CommentAutomationReplyChannel,
  CommentReply,
  CommentReplyType,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type {
  CommentAutomationMissInsert,
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { createId } from "@chatbotx.io/utils"
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
import {
  type CommentAutomationChannelType,
  supportsCommentLike,
} from "./channel-type"
import {
  createAttachmentInfoResolver,
  needsAttachmentInfo,
} from "./comment-attachment"
import { createTagInfoResolver } from "./comment-tags"
import {
  applyHideComments,
  hasHideCommentAction,
  supportsHideComments,
} from "./hide-comments"
import {
  executePrivateReply,
  isOutsidePrivateReplyWindow,
  supportsPrivateReply,
} from "./private-reply"
import { executePublicReply } from "./public-reply"
import type { CommentReplyOutcome } from "./reply-outcome"

export { isCommentReply } from "./automation-matching"

/**
 * Everything `processCommentAutomation` needs before it can look at a single
 * automation. Extracted so the caller can wrap exactly this phase in one
 * try/catch — a failure here belongs to the whole comment, not to any one
 * automation, and so cannot be recorded as an analytics event.
 */
async function loadCommentAutomationContext(props: {
  integrationType: string
  integrationIdentifier: string
  channelType: CommentAutomationChannelType
  contactInboxId: string
  workspaceId: string
}) {
  const { integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      props.integrationType as IntegrationType,
      props.integrationIdentifier,
    )

  const contactInbox = await contactInboxService.findBy({
    where: { id: props.contactInboxId },
  })

  const automations = await commentAutomationService.findActiveAutomations({
    workspaceId: props.workspaceId,
    channelType: props.channelType,
  })

  const workspace = await workspaceService.findById({ id: props.workspaceId })

  return {
    integrationRow,
    auth: integrationRow.auth as MessengerAuthValue,
    contactInbox,
    automations,
    workspace,
  }
}

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
    tags,
    createdTime,
  } = data

  // When the customer commented, not when this job runs — `replyAfter` can put
  // minutes between the two, and every analytics panel buckets on the comment.
  const occurredAt = new Date(createdTime * 1000)

  const channelType = integrationType as CommentAutomationChannelType

  // Everything up to the automation loop runs before any automation is known,
  // so a throw here cannot be attributed to one and cannot become an event row.
  // It is re-thrown to BullMQ untouched — but logged with the comment's identity
  // first, because the worker's own `failed` handler only has a job id, which is
  // not enough to tell which Page, post or workspace lost a reply.
  //
  // An `IntegrationNotFoundError` from the lookup below needs nothing extra
  // here: `runWithOrphanedIntegrationCleanup` (see `integration/job-context.ts`)
  // already disconnects the orphaned integration and marks the job
  // unrecoverable, which is a better answer than an error-log row.
  let context: Awaited<ReturnType<typeof loadCommentAutomationContext>>
  try {
    context = await loadCommentAutomationContext({
      integrationType,
      integrationIdentifier,
      channelType,
      contactInboxId,
      workspaceId,
    })
  } catch (err) {
    logger.error(
      {
        err,
        workspaceId,
        commentId,
        postId,
        conversationId,
        integrationType,
        integrationIdentifier,
      },
      "Comment automation failed before any automation ran",
    )
    throw err
  }

  const { integrationRow, auth, contactInbox, automations, workspace } = context

  if (!contactInbox) {
    logger.warn(
      { contactInboxId, workspaceId, commentId },
      "Comment automation skipped: contactInbox not found",
    )
    return
  }

  const resolveAttachmentInfo = createAttachmentInfoResolver({
    channelType,
    workspaceId,
    commentId,
    integrationRow,
    auth,
  })

  const resolveTagInfo = createTagInfoResolver({
    channelType,
    workspaceId,
    inboxId: integrationRow.inboxId,
    commentId,
    message,
    tags,
    integrationRow,
    auth,
  })

  // Meta allows a single comment_id-anchored DM per comment, and that budget is
  // shared by every automation matching this one comment — so it is tracked
  // across the loop, not per automation.
  let privateReplyClaimed = false

  // Every automation that declines this comment, flushed in ONE insert after
  // the loop. `findActiveAutomations` scopes by workspace + channel, not by
  // post, so a single comment is shown to every active automation on the
  // channel — writing a row per decline inside the loop would fire one
  // statement per automation per comment on a busy Page.
  const misses: CommentAutomationMissInsert[] = []
  const collectMiss = (
    automationId: string,
    reason: CommentAutomationMissReason,
  ) => {
    misses.push({
      id: createId(),
      workspaceId,
      automationId,
      contactId: contactInbox.contactId,
      contactInboxId: contactInbox.id,
      postId,
      commentId,
      commentText: message ?? null,
      reason,
      occurredAt,
    })
  }

  for (const automation of automations) {
    try {
      if (
        !commentAutomationService.isWithinSchedule(
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
        collectMiss(automation.id, "outsideSchedule")
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
        collectMiss(automation.id, "postNotMatched")
        continue
      }
      if (
        automation.options.ignoreCommentReplies &&
        isCommentReply(parentId, postId, commentId)
      ) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          // The one skip whose cause is invisible without the raw id: Facebook
          // varies the composite form of `parent_id` per post type, and a
          // wrongly-classified top-level comment looks identical in the log to
          // a genuine reply.
          parentId,
          reason: "comment is a reply",
        })
        collectMiss(automation.id, "commentIsReply")
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
        collectMiss(automation.id, "keywordsNotMatched")
        continue
      }

      if (automation.options.replyToNewContactsOnly) {
        const priorCount =
          await commentAutomationService.getPriorContactInboxCount({
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
          collectMiss(automation.id, "contactNotNew")
          continue
        }
      }

      if (automation.options.replyOncePerUserPerPost) {
        const existing = await commentAutomationService.findDedup({
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
          collectMiss(automation.id, "alreadyRepliedOnPost")
          continue
        }
      }

      if (!automation.options.replyToUsersWhoCommentedOnOtherPosts) {
        const repliedElsewhere =
          await commentAutomationService.hasRepliedOnOtherPost({
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
          collectMiss(automation.id, "engagedOnOtherPost")
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

        // Independent of hide-comment support/configuration above — tag
        // tracking is its own capability. Awaited, unlike the like/hide
        // fire-and-forget above: the reply below renders
        // `{{total_tagged}}`/`{{total_new_tagged}}` by reading these back off
        // this very row, so racing the send would render an empty value on
        // the first comment and the right one only on a retry.
        if (automation.options.trackUserTags) {
          try {
            const { totalTagged, totalNewTagged } = await resolveTagInfo()
            await messageRepo.updateContentAttributes(
              dbMessage.id,
              workspaceId,
              {
                ...dbMessage.contentAttributes,
                totalTagged,
                totalNewTagged,
              },
              dbMessage.createdAt,
            )
          } catch (err) {
            // Not a skip — the reply still goes out, just with the two tag
            // variables unresolved. Logged because nothing else would show it.
            logger.error(
              { err, automationId: automation.id, commentId, postId },
              "Failed to resolve user tags for comment",
            )
          }
        }
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
      // `commentAutomationService.deleteDedup`.
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
        await recordAndDispatchReply({
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

      // A private reply configured on a channel without a private-reply API
      // (Threads) can never be delivered — same class as the like/hide
      // capability checks above: logged, not recorded as a failed delivery,
      // since nothing was attempted.
      const privateReplyUnsupported =
        willSendReply(automation.privateReply) &&
        !supportsPrivateReply(channelType)

      if (privateReplyUnsupported) {
        logUnsupportedCapability({
          automationId: automation.id,
          commentId,
          capability: "private reply unsupported",
        })
      } else {
        // Two ways a configured DM never leaves, both decided here rather than
        // inside the executor so they can be recorded. Neither is a *filtered*
        // comment — this one passed every filter — it is a delivery Meta will not
        // accept, which is exactly what the automation "attempted", so it earns a
        // `failed` row the Error Logs panel can explain. No `logProviderError`:
        // Meta was never called, so no third party failed.
        const privateReplyBlockedReason = resolvePrivateReplyBlockedReason({
          privateReply: automation.privateReply,
          privateReplyClaimed,
          createdTime,
          delay,
        })

        if (privateReplyBlockedReason) {
          logAutomationSkipped({
            automationId: automation.id,
            commentId,
            postId,
            workspaceId,
            reason: privateReplyBlockedReason.logReason,
          })
          await recordBlockedPrivateReply({
            workspaceId,
            automationId: automation.id,
            contactInbox,
            commentId,
            postId,
            message,
            occurredAt,
            replyChannel: "private",
            replyType: automation.privateReply.type,
            errorDetail: privateReplyBlockedReason.errorDetail,
          })
        } else {
          try {
            privateOutcome = await executePrivateReply(
              automation.privateReply,
              {
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
              },
            )
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
      }

      if (privateOutcome) {
        await recordAndDispatchReply({
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
      // 2. An automation that sends nothing (like/hide only, or a private
      //    reply the channel cannot deliver at all — see
      //    `privateReplyUnsupported` above) still gets a row, so
      //    `replyOncePerUserPerPost` keeps gating it once per user per post.
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
        await commentAutomationService.insertDedup(dedup)
      }

      // Replies counts DMs, not comment replies — same scope as the five
      // delivery columns beside it, so a public-only automation reads as zero
      // across the whole row rather than showing a reply count with no
      // delivery stats under it. `anythingDispatched` above stays as it is:
      // dedup guards against sending twice and has nothing to do with stats.
      if (privateOutcome) {
        await commentAutomationService.incrementRepliesCount(automation.id)
      }
    } catch (err) {
      logger.error(
        { err, automationId: automation.id, commentId, workspaceId },
        "Failed to process comment automation",
      )
      await recordConfiguredBranchFailures({
        workspaceId,
        automationId: automation.id,
        contactInbox,
        commentId,
        postId,
        message,
        occurredAt,
        publicReply: automation.publicReply,
        privateReply: automation.privateReply,
        error: err,
      })
    }
  }

  // One insert for every automation that passed on this comment. Outside the
  // loop and outside its try/catch on purpose: a decline is bookkeeping, and
  // `recordMisses` never throws, so this can neither fail a reply nor be
  // skipped because some other automation in the list blew up.
  await commentAutomationAnalyticsService.recordMisses(misses)
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
  threads: "threads",
  tiktok: "tiktok",
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
 *
 * `sent` here means *dispatched*, not delivered, and for a public reply that is
 * provisional: the Graph API call happens later in the chat worker, which flips
 * this row to `failed` through the anchor `postPublicCommentReply` stamped on
 * the message (`settleCommentAutomationFailure`). A private text reply is sent
 * inline, so its failure is caught below instead.
 */
function recordReplyEvent(
  props: ReplyEventContext & { outcome: CommentReplyOutcome },
): Promise<void> {
  return commentAutomationAnalyticsService.recordEvent({
    workspaceId: props.workspaceId,
    automationId: props.automationId,
    contactId: props.contactInbox.contactId,
    contactInboxId: props.contactInbox.id,
    postId: props.postId,
    commentId: props.commentId,
    commentText: props.message ?? null,
    replyChannel: props.replyChannel,
    replyType: props.outcome.replyType,
    replyText: props.outcome.replyText,
    status: "sent",
    occurredAt: props.occurredAt,
    // Non-null only for a send that already completed (a `text` reply). Born
    // delivered, because the `markDelivered` that used to do this ran before
    // this very row existed and matched nothing.
    deliveredAt: props.outcome.deliveredAt ?? null,
  })
}

/**
 * Writes the reply's analytics row, THEN enqueues whatever async work it stands
 * for.
 *
 * The order is the point. The queued job settles delivery on this very row, and
 * an automation with no `replyAfter` gives it a delay of 0 — so enqueuing first
 * let the worker pick the job up and settle a row that had not been inserted
 * yet, losing `deliveredAt` and, with it, `seenAt`. See `dispatch` on
 * `CommentReplyOutcome`.
 *
 * A dispatch that throws flips the row it just wrote to `failed` rather than
 * recording a fresh failure: the insert is keyed on `(automationId, commentId,
 * replyChannel)`, so a second row would be dropped as a conflict and the
 * failure would go unrecorded. The caller still treats the branch as
 * dispatched, which keeps the dedup row — one missed reply beats replying to
 * the contact's next comment twice.
 */
async function recordAndDispatchReply(
  props: ReplyEventContext & { outcome: CommentReplyOutcome },
): Promise<void> {
  await recordReplyEvent(props)

  if (!props.outcome.dispatch) {
    return
  }

  try {
    await props.outcome.dispatch()
  } catch (err) {
    logger.error(
      {
        err,
        automationId: props.automationId,
        commentId: props.commentId,
        replyChannel: props.replyChannel,
      },
      "Failed to enqueue comment automation reply",
    )
    await commentAutomationAnalyticsService.settleEvent({
      automationId: props.automationId,
      commentId: props.commentId,
      replyChannel: props.replyChannel,
      status: "failed",
      errorDetail: err instanceof Error ? err.message : String(err),
    })
  }
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
    replyType: CommentReplyType
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
        contactInboxId: props.contactInbox.id,
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

/**
 * Why a configured private reply will not be dispatched at all, or `null` when
 * it can go ahead.
 *
 * Both reasons are Meta's rules, not ours: a comment_id-anchored DM is accepted
 * only within 7 days of the comment, and only once per comment no matter how
 * many automations match it.
 */
function resolvePrivateReplyBlockedReason(props: {
  privateReply: CommentReply
  privateReplyClaimed: boolean
  createdTime: number
  delay: number
}): { logReason: string; errorDetail: string } | null {
  if (!willSendReply(props.privateReply)) {
    return null
  }

  if (props.privateReplyClaimed) {
    return {
      logReason: "private reply already claimed for this comment",
      errorDetail:
        "Private reply not sent: another automation already used this comment's single private reply",
    }
  }

  if (
    isOutsidePrivateReplyWindow({
      createdTime: props.createdTime,
      delay: props.delay,
    })
  ) {
    return {
      logReason: "comment older than the 7-day private reply window",
      errorDetail:
        "Private reply not sent: the comment is outside Meta's 7-day private reply window",
    }
  }

  return null
}

/**
 * A configured DM that Meta will not accept. Recorded as `failed` with a
 * human-readable `errorDetail` — the row is the only way the workspace can tell
 * this apart from "the automation never matched".
 *
 * Swallows its own failures: it runs on a path that still has to write the
 * dedup row below.
 */
async function recordBlockedPrivateReply(
  props: ReplyEventContext & {
    replyType: CommentReplyType
    errorDetail: string
  },
): Promise<void> {
  try {
    await commentAutomationAnalyticsService.recordEvent({
      workspaceId: props.workspaceId,
      automationId: props.automationId,
      contactId: props.contactInbox.contactId,
      contactInboxId: props.contactInbox.id,
      postId: props.postId,
      commentId: props.commentId,
      commentText: props.message ?? null,
      replyChannel: props.replyChannel,
      replyType: props.replyType,
      replyText: null,
      status: "failed",
      errorDetail: props.errorDetail,
      occurredAt: props.occurredAt,
    })
  } catch (err) {
    logger.error(
      { err, automationId: props.automationId, commentId: props.commentId },
      "Failed to record a blocked comment automation private reply",
    )
  }
}

/**
 * The catch-all for an automation that blew up *before* either reply branch
 * reported an outcome — a DB read for one of the option gates, the message-row
 * lookup, the shard client. Without this the comment left no trace at all: no
 * `sent` row, no `failed` row, and the customer got nothing while the dashboard
 * showed a clean run.
 *
 * Records by *configuration* rather than by outcome, because there is no
 * outcome yet: every branch the automation was set up to send gets a `failed`
 * row. `willSendReply` keeps a `none`/empty branch out of it.
 *
 * Rows already written win — `insertEvents` is `onConflictDoNothing` on
 * `(automationId, commentId, replyChannel)`, so a branch that already
 * dispatched (`sent`) or already failed on send keeps its row and this insert
 * is a no-op. That is what makes it safe to run for a throw from the *post*
 * dispatch bookkeeping (`insertDedup`, `incrementRepliesCount`) too.
 *
 * Deliberately does NOT call `logProviderError`: `ErrorLog.action` names the
 * third party that failed and the UI renders it as a vendor name, but nothing
 * here reached Meta — attributing a shard timeout to "Messenger" would send the
 * workspace chasing a channel that is working fine. The automation's own Error
 * Logs panel is the right surface, and it reads these rows.
 *
 * Swallows its own failures, same reason as `recordReplyFailure`.
 */
async function recordConfiguredBranchFailures(
  props: Omit<ReplyEventContext, "replyChannel"> & {
    publicReply: CommentReply
    privateReply: CommentReply
    error: unknown
  },
): Promise<void> {
  const detail =
    props.error instanceof Error ? props.error.message : String(props.error)

  const configuredBranches = [
    { channel: "public" as const, reply: props.publicReply },
    { channel: "private" as const, reply: props.privateReply },
  ].filter((branch) => willSendReply(branch.reply))

  if (configuredBranches.length === 0) {
    return
  }

  try {
    await Promise.all(
      configuredBranches.map((branch) =>
        commentAutomationAnalyticsService.recordEvent({
          workspaceId: props.workspaceId,
          automationId: props.automationId,
          contactId: props.contactInbox.contactId,
          contactInboxId: props.contactInbox.id,
          postId: props.postId,
          commentId: props.commentId,
          commentText: props.message ?? null,
          replyChannel: branch.channel,
          replyType: branch.reply.type,
          replyText: null,
          status: "failed",
          errorDetail: detail,
          occurredAt: props.occurredAt,
        }),
      ),
    )
  } catch (err) {
    logger.error(
      { err, automationId: props.automationId, commentId: props.commentId },
      "Failed to record a comment automation pre-dispatch failure",
    )
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
  parentId,
  reason,
}: {
  automationId: string
  commentId: string
  postId: string
  workspaceId: string
  parentId?: string
  reason: string
}) => {
  logger.info(
    { automationId, commentId, postId, workspaceId, parentId, reason },
    "Comment automation skipped",
  )
}
