import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import {
  commentAutomationService,
  contactInboxService,
  workspaceService,
} from "@chatbotx.io/business"
import type {
  CommentAutomationMissReason,
  CommentReply,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type {
  CommentAutomationMissInsert,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { createId } from "@chatbotx.io/utils"
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
import { enqueueDeferredPrivateReply } from "./deferred-private-reply"
import {
  applyHideComments,
  hasHideCommentAction,
  supportsHideComments,
} from "./hide-comments"
import {
  executePrivateReply,
  isCommentFlaggedHighIntent,
  isOutsidePrivateReplyWindow,
  privateReplyRequiresHighIntent,
  privateReplyWindowLabel,
  supportsPrivateReply,
} from "./private-reply"
import { executePublicReply } from "./public-reply"
import {
  logAutomationSkipped,
  logUnsupportedCapability,
  recordAndDispatchReply,
  recordBlockedPrivateReply,
  recordConfiguredBranchFailures,
  recordReplyFailure,
} from "./record"
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
  // unrecoverable, which is a better answer than an error-log row. (Channels in
  // `isExpectedOrphan` complete the job instead; none has comment automation.)
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
      // A DM handed to the deferred job rather than sent here. Counts as
      // dispatched for the dedup row below — the comment's single private reply
      // is already spoken for — but not for the replies counter, which only
      // moves once something actually went out.
      let privateDeferred = false

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

      // A private reply the channel cannot carry can never be delivered — same
      // class as the like/hide capability checks above: logged, not recorded as
      // a failed delivery, since nothing was attempted.
      //
      // Two shapes of that. Threads has no private-reply API at all. And a
      // `flow` cannot run over a conditional channel's DM: TikTok grants exactly
      // one comment-anchored message while `sendFlowStep` needs a
      // `conversation_id` from step 2 onwards, so `executePrivateReply` rejects
      // it outright. The second is checked HERE as well as in the executor
      // because the defer branch below runs first — deferring a flow would claim
      // the comment's single DM budget, blocking another automation's
      // deliverable `text` DM, and then record nothing when the executor
      // declined it minutes later. Only a legacy row reaches it: new writes
      // normalize `flow` away on these channels.
      const privateReplyUnsupported =
        willSendReply(automation.privateReply) &&
        (!supportsPrivateReply(channelType) ||
          (automation.privateReply.type === "flow" &&
            privateReplyRequiresHighIntent(channelType)))

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
          channelType,
          createdTime,
          delay,
        })

        // On a conditional channel (TikTok) the DM is only permitted once the
        // channel has flagged the comment high intent, and that verdict rides
        // a separate webhook with no ordering guarantee. If the flag is not on
        // the comment row yet, hand the branch to the deferred job rather than
        // calling the executor: it re-checks on a bounded schedule and either
        // sends or records one blocked event.
        //
        // The comment's single DM is claimed here, not when the deferred job
        // eventually sends — otherwise a second automation matching the same
        // comment would queue a second deferral for the same budget.
        const deferPrivateReply =
          !privateReplyBlockedReason &&
          willSendReply(automation.privateReply) &&
          privateReplyRequiresHighIntent(channelType) &&
          !isCommentFlaggedHighIntent(dbMessage?.contentAttributes)

        if (deferPrivateReply) {
          privateReplyClaimed = true
          privateDeferred = true
          await enqueueDeferredPrivateReply({
            integrationType,
            integrationIdentifier,
            workspaceId,
            automationId: automation.id,
            channelType,
            commentId,
            postId,
            conversationId,
            contactInboxId,
            message,
            createdTime,
            occurredAtIso: occurredAt.toISOString(),
            privateReply: automation.privateReply,
            dedup,
            // Carried so the deferred job can spend whatever is left of it,
            // rather than dropping `replyAfter` the moment a DM is deferred.
            delay,
            attempt: 0,
          })
        } else if (privateReplyBlockedReason) {
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
      // 4. A deferred DM counts as dispatched: the comment's single private
      //    reply is already claimed, and without the row the contact's next
      //    comment would match again and queue a second deferral.
      const anythingDispatched =
        publicOutcome !== null || privateOutcome !== null || privateDeferred
      const anythingConfigured =
        willSendReply(automation.publicReply) ||
        willSendReply(automation.privateReply)

      if (anythingDispatched || !anythingConfigured) {
        await commentAutomationService.insertDedup(dedup)
      }

      // Replies has the same scope as the delivery columns beside it, and that
      // scope is per CHANNEL, not per automation: where a comment-anchored DM
      // exists it counts DMs, so a Messenger automation replying publicly only
      // reads zero across the whole row rather than showing a reply count with
      // no delivery stats under it. Where the channel has no DM at all
      // (Threads) the public reply is the only reply there is, and counting
      // nothing left every column of a working automation at zero.
      //
      // TikTok has a DM, so it counts DMs — but only ones that actually went
      // out. A deferred branch deliberately does NOT count here; the deferred
      // job increments this itself if and when it sends.
      // Mirrors `countsTowardStats` in the analytics service — the two decide
      // the same question for the same row and must agree.
      // `anythingDispatched` above stays as it is: dedup guards against sending
      // twice and has nothing to do with stats.
      const replyCounts = supportsPrivateReply(channelType)
        ? privateOutcome !== null
        : publicOutcome !== null
      if (replyCounts) {
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
 * Why a configured private reply will not be dispatched at all, or `null` when
 * it can go ahead.
 *
 * Both reasons are the channel's rules, not ours: a comment-anchored DM is
 * accepted only inside the channel's window (7 days on Meta, 48 hours on
 * TikTok), and only once per comment no matter how many automations match it.
 */
export function resolvePrivateReplyBlockedReason(props: {
  privateReply: CommentReply
  privateReplyClaimed: boolean
  channelType: CommentAutomationChannelType
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
      channelType: props.channelType,
      createdTime: props.createdTime,
      delay: props.delay,
    })
  ) {
    const window = privateReplyWindowLabel(props.channelType)
    return {
      logReason: `comment older than ${window}`,
      errorDetail: `Private reply not sent: the comment is outside ${window}`,
    }
  }

  return null
}
