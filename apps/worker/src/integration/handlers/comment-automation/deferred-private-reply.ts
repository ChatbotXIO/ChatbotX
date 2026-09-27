import {
  commentAutomationService,
  contactInboxService,
} from "@chatbotx.io/business"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  IntegrationJobAction,
  type IntegrationJobDeferredCommentPrivateReply,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { integrationService } from "../../../services/integrations"
import {
  executePrivateReply,
  isCommentFlaggedHighIntent,
  isOutsidePrivateReplyWindow,
  type PrivateReplyAuth,
  privateReplyWindowLabel,
} from "./private-reply"
import {
  recordAndDispatchReply,
  recordBlockedPrivateReply,
  recordReplyFailure,
} from "./record"

type DeferredPrivateReplyData =
  IntegrationJobDeferredCommentPrivateReply["data"]

/**
 * How long to wait before each re-check of the high-intent flag.
 *
 * Three tries spanning ~13 minutes. TikTok's own comment webhook has a delivery
 * window of roughly five minutes, and the send window is 48 hours, so this is
 * generous where it matters and still gives up long before the DM would be
 * refused. The array length IS the attempt budget — `attempt` indexes it.
 */
const DEFERRED_PRIVATE_REPLY_DELAYS_MS = [45_000, 180_000, 600_000]

export const deferredPrivateReplyJobId = (props: {
  automationId: string
  commentId: string
  attempt: number
}): string =>
  `comment-private-${props.automationId}-${props.commentId}-${props.attempt}`

/**
 * Hands a matched-but-not-yet-permitted DM to the delayed queue.
 *
 * Exported for `processCommentAutomation`, which decides to defer; keeping the
 * delay table and the job id in one place stops the first enqueue and the
 * re-enqueues below from drifting apart.
 */
export async function enqueueDeferredPrivateReply(
  data: DeferredPrivateReplyData,
): Promise<void> {
  await integrationQueue.add(
    IntegrationJobAction.deferredCommentPrivateReply,
    { type: IntegrationJobAction.deferredCommentPrivateReply, data },
    {
      delay: DEFERRED_PRIVATE_REPLY_DELAYS_MS[data.attempt],
      jobId: deferredPrivateReplyJobId(data),
      // One attempt per scheduled re-check: this job re-enqueues itself rather
      // than relying on BullMQ retries, so its own failure should not silently
      // double the schedule.
      attempts: 1,
    },
  )
}

/**
 * Sends a private reply the main automation pass deferred, once the channel has
 * flagged the comment as high intent.
 *
 * Only TikTok reaches this today. The flag lands on the comment's own message
 * row (`contentAttributes.tiktokHighIntent`) from a separate webhook, so this
 * job's whole job is to re-read that row on a bounded schedule.
 *
 * It never rolls back the dedup row. The public reply of the same automation
 * may already have gone out, and releasing the row would let the contact's next
 * comment send it a second time — a missed DM beats a duplicate reply.
 */
export async function runDeferredCommentPrivateReply(
  data: DeferredPrivateReplyData,
): Promise<void> {
  const {
    integrationType,
    integrationIdentifier,
    workspaceId,
    automationId,
    channelType,
    commentId,
    postId,
    conversationId,
    contactInboxId,
    message,
    createdTime,
    occurredAtIso,
    privateReply,
    dedup,
    attempt,
  } = data

  const occurredAt = new Date(occurredAtIso)

  const contactInbox = await contactInboxService.findBy({
    where: { id: contactInboxId },
  })
  if (!contactInbox) {
    logger.warn(
      { automationId, commentId, contactInboxId, workspaceId },
      "Deferred private reply skipped: contactInbox not found",
    )
    return
  }

  // What is LEFT of the automation's `replyAfter`, not the whole thing: the
  // deferral schedule has already burned part of it. Without this the deferred
  // path ignored `replyAfter` outright, so an automation set to answer after 10
  // minutes fired at the 45-second re-check — and the send-window check below
  // measured the comment's age at the wrong moment too.
  const configuredDelay = data.delay ?? 0
  const remainingDelay = Math.max(
    0,
    configuredDelay - (Date.now() - occurredAt.getTime()),
  )

  const messageRepo = await createMessageRepository()
  const dbMessage = await messageRepo.findBySourceId(
    commentId,
    conversationId,
    workspaceId,
    occurredAt,
  )

  if (!isCommentFlaggedHighIntent(dbMessage?.contentAttributes)) {
    const nextAttempt = attempt + 1
    if (nextAttempt < DEFERRED_PRIVATE_REPLY_DELAYS_MS.length) {
      logger.info(
        { automationId, commentId, workspaceId, attempt: nextAttempt },
        "Deferred private reply: comment still not flagged high intent, re-checking later",
      )
      await enqueueDeferredPrivateReply({ ...data, attempt: nextAttempt })
      return
    }

    logger.info(
      { automationId, commentId, workspaceId },
      "Deferred private reply given up: comment was never flagged high intent",
    )
    await recordBlockedPrivateReply({
      workspaceId,
      automationId,
      contactInbox,
      commentId,
      postId,
      message,
      occurredAt,
      replyChannel: "private",
      replyType: privateReply.type,
      errorDetail:
        "Private reply not sent: TikTok did not flag this comment as high intent, which Comment-to-Message requires",
    })
    return
  }

  // The wait can outlast the send window — 48 hours is generous but the
  // schedule above plus a backlogged queue is not free. Recorded rather than
  // attempted, so the workspace sees why nothing arrived.
  if (
    isOutsidePrivateReplyWindow({
      channelType,
      createdTime,
      delay: remainingDelay,
    })
  ) {
    const window = privateReplyWindowLabel(channelType)
    logger.info(
      { automationId, commentId, workspaceId },
      `Deferred private reply skipped: comment is outside ${window}`,
    )
    await recordBlockedPrivateReply({
      workspaceId,
      automationId,
      contactInbox,
      commentId,
      postId,
      message,
      occurredAt,
      replyChannel: "private",
      replyType: privateReply.type,
      errorDetail: `Private reply not sent: the comment is outside ${window}`,
    })
    return
  }

  let outcome: Awaited<ReturnType<typeof executePrivateReply>> = null
  try {
    // Inside the try, not before it: the integration can be disconnected during
    // the 45s–13min wait, and `attempts: 1` means a throw out of this handler
    // dies with no `failed` row and no Error Log — while the dedup row has
    // already claimed the comment, so nothing else will ever answer it either.
    const { integrationRow } =
      await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
        integrationType as IntegrationType,
        integrationIdentifier,
      )

    outcome = await executePrivateReply(privateReply, {
      auth: integrationRow.auth as PrivateReplyAuth,
      automationId,
      integrationType,
      integrationIdentifier,
      commentId,
      channelType,
      conversationId,
      contactInboxId,
      contactInbox,
      workspaceId,
      // What the deferral wait did not already spend of `replyAfter`.
      delay: remainingDelay,
      message,
      createdTime,
      dedup,
    })
  } catch (err) {
    // The send-time conditions nothing here can check — commenter under 18,
    // already answered by DM from the TikTok app, a DM exchanged in the past
    // 24 hours, the wrong region — are only ever reported by the channel, at
    // this moment. `recordReplyFailure` keeps that wording on the row AND on
    // the workspace Error Logs page, which is the only way an operator can
    // look the rejection up.
    logger.error(
      { err, automationId, commentId, workspaceId },
      "Failed to send deferred private reply",
    )
    await recordReplyFailure({
      workspaceId,
      automationId,
      contactInbox,
      commentId,
      postId,
      message,
      occurredAt,
      channelType,
      replyChannel: "private",
      replyType: privateReply.type,
      error: err,
    })
    return
  }

  // `executePrivateReply` declines without throwing for a reply the channel
  // cannot deliver at all. The gate in `processCommentAutomation` rejects those
  // before deferring, so reaching here means the two disagree — record it rather
  // than returning silently, or the comment's claimed DM budget is spent with
  // nothing at all to show for it.
  if (!outcome) {
    logger.warn(
      { automationId, commentId, workspaceId, replyType: privateReply.type },
      "Deferred private reply produced no outcome: the executor declined a reply the defer gate had accepted",
    )
    await recordBlockedPrivateReply({
      workspaceId,
      automationId,
      contactInbox,
      commentId,
      postId,
      message,
      occurredAt,
      replyChannel: "private",
      replyType: privateReply.type,
      errorDetail:
        "Private reply not sent: this reply type is not deliverable on this channel",
    })
    return
  }

  await recordAndDispatchReply({
    workspaceId,
    automationId,
    contactInbox,
    commentId,
    postId,
    message,
    occurredAt,
    replyChannel: "private",
    outcome,
  })

  // Deliberately here rather than in the main pass: on this channel the
  // counters measure the DM, and until now nothing had gone out to count.
  await commentAutomationService.incrementRepliesCount(automationId)
}
