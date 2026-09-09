import { ChannelError } from "../channel-error"
import { ChannelErrorCategory } from "../channel-error-codes"

export const META_RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000
export const META_HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Error code raised when a comment-triggered flow runs past the one anchored
 * DM Meta grants per comment and the contact has not opened a messaging window
 * of their own. Surfaces on the message row as `sendError`, so the inbox says
 * why the rest of the flow is missing.
 */
export const COMMENT_PRIVATE_REPLY_SPENT_CODE =
  "comment_private_reply_already_used"

export function normalizeLastIncomingMessageAt(
  value: Date | string | null | undefined,
): Date | null {
  if (!value) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Whether the contact's own last inbound message still keeps Meta's 24-hour
 * standard messaging window open.
 */
export function isWithinMetaResponseWindow(props: {
  lastIncomingMessageAt: Date | string | null | undefined
  now?: Date | number
}): boolean {
  const lastIncomingMessageAt = normalizeLastIncomingMessageAt(
    props.lastIncomingMessageAt,
  )
  if (!lastIncomingMessageAt) {
    return false
  }

  let nowMs = Date.now()
  if (props.now instanceof Date) {
    nowMs = props.now.getTime()
  } else if (typeof props.now === "number") {
    nowMs = props.now
  }

  return nowMs - lastIncomingMessageAt.getTime() <= META_RESPONSE_WINDOW_MS
}

/**
 * Gate for every message of a comment-triggered private-reply flow after the
 * first one.
 *
 * Meta accepts exactly one comment_id-anchored DM per comment; the first
 * message-producing step spends it. A follow-up can only be delivered as a
 * normal DM, and Meta accepts that only inside the 24-hour window the contact
 * opened by messaging the Page — replying to a comment does not open one. Left
 * unchecked, the Send API rejects the follow-up and `sendFlowStep`'s catch
 * turns it into an opaque failure, so a two-message flow looks like it half
 * worked with no explanation. Fail loudly here instead.
 */
export function assertCommentPrivateReplyFollowUpDeliverable(props: {
  commentId: string
  lastIncomingMessageAt: Date | string | null | undefined
  now?: Date | number
}): void {
  if (isWithinMetaResponseWindow(props)) {
    return
  }

  throw new ChannelError(
    "Meta allows one private reply per comment. The rest of this flow needs the contact to message first — no reply from them in the last 24 hours.",
    ChannelErrorCategory.PAYLOAD_INVALID,
    { code: COMMENT_PRIVATE_REPLY_SPENT_CODE },
  )
}
