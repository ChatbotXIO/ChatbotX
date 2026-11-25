import type { RecordedCommentOutcome } from "@chatbotx.io/business"
import type { TriggerEventType } from "@chatbotx.io/database/partials"
import type { InboxModel } from "@chatbotx.io/database/types"
import {
  emitContactCommentedOnPost,
  emitContactFirstCommentedOnPost,
  hasActiveTriggers,
  hasActiveWebhooks,
  type PostCommentEmitterKind,
  type PostCommentEventMetadata,
} from "@chatbotx.io/events"
import { getRedisConnection } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

/** How long a contact's "first comment on this post" claim is remembered. */
const FIRST_COMMENT_CLAIM_TTL_SECONDS = 30 * 24 * 60 * 60

/** How long an emitted comment event is remembered, so a webhook redelivery or job retry does not fire it twice. */
const COMMENT_EVENT_CLAIM_TTL_SECONDS = 7 * 24 * 60 * 60

type PostCommentEventName = "commented" | "firstCommented"

const firstCommentClaimKey = (input: {
  channelPostId: string
  contactInboxId: string
  workspaceId: string
}): string =>
  `post-comment:first:${input.workspaceId}:${input.contactInboxId}:${input.channelPostId}`

/** One claim per event and per emitter, so a retry re-emits only to the emitter that failed. */
type EventClaim = {
  commentId: string
  emitter: PostCommentEmitterKind
  event: PostCommentEventName
  inboxId: string
}

const EMITTER_KINDS: readonly PostCommentEmitterKind[] = ["trigger", "webhook"]

const eventClaimKey = (input: EventClaim): string =>
  `post-comment:emitted:${input.inboxId}:${input.commentId}:${input.event}:${input.emitter}`

/** Whether the emitter has an active listener (trigger or webhook) for the event. */
const emitterListens = (
  emitter: PostCommentEmitterKind,
  workspaceId: string,
  event: TriggerEventType,
): Promise<boolean> =>
  emitter === "trigger"
    ? hasActiveTriggers(workspaceId, [event])
    : hasActiveWebhooks(workspaceId, [event])

/**
 * Whether anything listens to one of the events in this workspace: an active
 * trigger or an active webhook (both answered from their caches). With no
 * listener nothing is written to Redis, so an unused feature grows no keys.
 */
const hasListener = async (
  workspaceId: string,
  eventTypes: TriggerEventType[],
): Promise<boolean> =>
  (await hasActiveTriggers(workspaceId, eventTypes)) ||
  (await hasActiveWebhooks(workspaceId, eventTypes))

const FIRST_EVENT: TriggerEventType = "contactFirstCommentedOnPost"
const COMMENTED_EVENT: TriggerEventType = "contactCommentedOnPost"

/**
 * Names the winner of "first comment on this post": call it right after
 * `recordCommentOutcome`, before any slow step. The insert into
 * `ContactInboxPost` (unique per workspace, contact inbox and post) decides who
 * wins atomically, and writing the winner's comment id at once means a second
 * comment of the same instant (the row keeps only whole seconds) that reads the
 * claim can tell it is not the winner. A stale claim from an earlier life of
 * the row (contact deleted, commented again) is replaced by the insert.
 * Writes nothing when no trigger or webhook listens to the first-comment event.
 */
export const claimFirstCommentWinner = async (input: {
  channelPostId: string
  commentId: string
  contactInboxId: string
  outcome: RecordedCommentOutcome
  workspaceId: string
}): Promise<void> => {
  if (input.outcome.status !== "inserted") {
    return
  }
  if (!(await hasListener(input.workspaceId, [FIRST_EVENT]))) {
    return
  }
  await getRedisConnection("hot").set(
    firstCommentClaimKey(input),
    input.commentId,
    "EX",
    FIRST_COMMENT_CLAIM_TTL_SECONDS,
  )
}

/**
 * Whether this comment is the contact's first on the post. The insert decides
 * it atomically, so two comments racing cannot both be first. A retry or a
 * redelivery of the winner finds the row already there, and only the winner's
 * own id in the claim (written by `claimFirstCommentWinner`) makes it first
 * again. This only reads the claim: a missing or evicted key is "not first",
 * so a welcome flow is never fired twice.
 */
export const isFirstCommentOnPost = async (input: {
  channelPostId: string
  commentId: string
  contactInboxId: string
  outcome: RecordedCommentOutcome
  workspaceId: string
}): Promise<boolean> => {
  if (input.outcome.status === "skipped") {
    return false
  }
  if (input.outcome.status === "inserted") {
    return true
  }
  const winner = await getRedisConnection("hot").get(
    firstCommentClaimKey(input),
  )
  return winner === input.commentId
}

/** Claims one event of one comment for emitting; false when it was already emitted. */
const claimCommentEvent = async (input: EventClaim): Promise<boolean> => {
  const claimed = await getRedisConnection("hot").set(
    eventClaimKey(input),
    "1",
    "EX",
    COMMENT_EVENT_CLAIM_TTL_SECONDS,
    "NX",
  )
  return claimed === "OK"
}

/** Gives a claim back when its event could not be queued, so a redelivery can emit it. */
const releaseCommentEvent = async (input: EventClaim): Promise<void> => {
  try {
    await getRedisConnection("hot").del(eventClaimKey(input))
  } catch (err) {
    logger.error(
      { err, commentId: input.commentId, inboxId: input.inboxId },
      "receiveComment: unable to release a post comment event claim",
    )
  }
}

/** Claims an event, emits it, and releases the claim when the emit fails. */
const emitClaimedEvent = async (
  claim: EventClaim,
  emit: () => Promise<void>,
): Promise<void> => {
  if (!(await claimCommentEvent(claim))) {
    return
  }
  try {
    await emit()
  } catch (err) {
    await releaseCommentEvent(claim)
    throw err
  }
}

export type PostCommentTriggerInput = {
  channelPostId: string
  commentId: string
  commentText: string | null
  contactId: string
  contactInboxId: string
  conversationId: string
  externalPostId: string
  inbox: Pick<InboxModel, "id" | "workspaceId" | "channel">
  outcome: RecordedCommentOutcome
  savedComment: { createdAt: Date; id: string }
}

/**
 * Fires `contactCommentedOnPost` for a valid comment on a tracked post, and
 * `contactFirstCommentedOnPost` when it is the contact's first on that post.
 *
 * Only a channel that tracks posts reaches this (the caller has a stored post),
 * so Threads and TikTok comments never fire. With no trigger or webhook
 * listening, nothing is claimed in Redis. Each event is claimed once per
 * comment and emitter (trigger queue, webhook queue) in Redis: a redelivered webhook or a retried job finds its claim and
 * emits nothing; a failed enqueue gives back only its own emitter's claim. The emit stays out of the page's own comments (ingestion drops
 * those first), which is what keeps a trigger's reply from retriggering.
 */
export const emitPostCommentTriggers = async (
  input: PostCommentTriggerInput,
): Promise<void> => {
  const { inbox } = input
  if (input.outcome.status === "skipped") {
    return
  }
  const [commentedListens, firstListens] = await Promise.all([
    hasListener(inbox.workspaceId, [COMMENTED_EVENT]),
    hasListener(inbox.workspaceId, [FIRST_EVENT]),
  ])
  if (!(commentedListens || firstListens)) {
    return
  }

  // Resolved before any emit starts: if this read throws, no emit is orphaned.
  const isFirst =
    firstListens &&
    (await isFirstCommentOnPost({
      channelPostId: input.channelPostId,
      commentId: input.commentId,
      contactInboxId: input.contactInboxId,
      outcome: input.outcome,
      workspaceId: inbox.workspaceId,
    }))

  const metadata: PostCommentEventMetadata = {
    channelPostId: input.channelPostId,
    externalPostId: input.externalPostId,
    inboxId: inbox.id,
    channel: inbox.channel,
    commentId: input.commentId,
    commentMessageId: input.savedComment.id,
    commentMessageCreatedAt: input.savedComment.createdAt.toISOString(),
    commentText: input.commentText,
    conversationId: input.conversationId,
  }

  const events: {
    emit: (emitter: PostCommentEmitterKind) => Promise<void>
    event: PostCommentEventName
    type: TriggerEventType
  }[] = []
  if (commentedListens) {
    events.push({
      event: "commented",
      type: COMMENTED_EVENT,
      emit: (emitter) =>
        emitContactCommentedOnPost(
          inbox.workspaceId,
          input.contactId,
          metadata,
          input.contactInboxId,
          emitter,
        ),
    })
  }
  if (isFirst) {
    events.push({
      event: "firstCommented",
      type: FIRST_EVENT,
      emit: (emitter) =>
        emitContactFirstCommentedOnPost(
          inbox.workspaceId,
          input.contactId,
          metadata,
          input.contactInboxId,
          emitter,
        ),
    })
  }

  // One settled batch: every emit is awaited, none can be orphaned.
  const emits = events.flatMap((item) =>
    EMITTER_KINDS.map(async (emitter) => {
      if (!(await emitterListens(emitter, inbox.workspaceId, item.type))) {
        return
      }
      await emitClaimedEvent(
        {
          commentId: input.commentId,
          emitter,
          event: item.event,
          inboxId: inbox.id,
        },
        () => item.emit(emitter),
      )
    }),
  )
  const results = await Promise.allSettled(emits)
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  )
  if (failed) {
    throw failed.reason
  }
}

/**
 * The comment is already stored and its automation still has to be queued, so
 * a failure here (Redis, the queue) is logged instead of failing the job: a
 * retry would only skip a comment it finds already stored.
 */
export const emitPostCommentTriggersBestEffort = async (
  input: PostCommentTriggerInput,
): Promise<void> => {
  try {
    await emitPostCommentTriggers(input)
  } catch (err) {
    logger.error(
      { err, commentId: input.commentId, inboxId: input.inbox.id },
      "receiveComment: unable to emit the post comment triggers",
    )
  }
}

/** `claimFirstCommentWinner` that logs a failure instead of failing the job (the fail-safe is "not first"). */
export const claimFirstCommentWinnerBestEffort = async (
  input: Parameters<typeof claimFirstCommentWinner>[0],
): Promise<void> => {
  try {
    await claimFirstCommentWinner(input)
  } catch (err) {
    logger.error(
      { err, commentId: input.commentId },
      "receiveComment: unable to record the first comment winner",
    )
  }
}
