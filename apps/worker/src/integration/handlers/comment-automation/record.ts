import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import { logProviderError } from "@chatbotx.io/business"
import type {
  CommentAutomationReplyChannel,
  CommentReply,
  CommentReplyType,
} from "@chatbotx.io/database/partials"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import type { ErrorLogProvider } from "@chatbotx.io/utils/error-log"
import { logger } from "../../../lib/logger"
import { willSendReply } from "./automation-matching"
import type { CommentAutomationChannelType } from "./channel-type"
import type { CommentReplyOutcome } from "./reply-outcome"

/**
 * Analytics bookkeeping for a comment automation reply, shared by the main
 * `processCommentAutomation` pass and the deferred private-reply job.
 *
 * Extracted verbatim from `index.ts` so the deferred job can open the same rows
 * on the same keys. Every function here swallows its own failures for the
 * reason each docblock gives: recording a failure must never be able to cause
 * one, because the caller still has a dedup row to write.
 */

/**
 * The `ErrorLog` provider slug for a comment-automation channel. Instagram via
 * either login path is one third party as far as the workspace error log is
 * concerned — `instagramFacebook` is a connection route, not a vendor.
 */
export const ERROR_LOG_PROVIDER_BY_CHANNEL: Record<
  CommentAutomationChannelType,
  ErrorLogProvider
> = {
  messenger: "messenger",
  instagram: "instagram",
  instagramFacebook: "instagram",
  threads: "threads",
  tiktok: "tiktok",
}

export type ReplyEventContext = {
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
export async function recordAndDispatchReply(
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
export async function recordReplyFailure(
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
 * A configured DM the channel will not accept. Recorded as `failed` with a
 * human-readable `errorDetail` — the row is the only way the workspace can tell
 * this apart from "the automation never matched".
 *
 * Swallows its own failures: it runs on a path that still has to write the
 * dedup row below.
 */
export async function recordBlockedPrivateReply(
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
export async function recordConfiguredBranchFailures(
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
export const logUnsupportedCapability = ({
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

export const logAutomationSkipped = ({
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
