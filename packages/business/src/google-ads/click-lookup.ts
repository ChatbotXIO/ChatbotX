import { distributedStore } from "@chatbotx.io/redis"
import type { IncomingMessage } from "@chatbotx.io/sdk"
import { resolveGoogleClickCaptureSource } from "@chatbotx.io/utils/google-click"
import { isInboundConversationMessage } from "../contact/profile-refresh/rules"
import { logger } from "../logger"

/*
 * Policy for channels whose Google click is only readable through an API call
 * about the contact (`GOOGLE_CLICK_CAPTURE_SOURCE_BY_CHANNEL` = `profileLookup`,
 * today Zalo `dynamic_param`). Two Redis markers per contact inbox keep that
 * call rare and bounded:
 *
 * - `attempt` (5 min, atomic NX): one lookup at a time, and the backoff after a
 *   failed one, so a burst of messages or a failing API never fans out;
 * - `done` (24 h): set only after the referral was persisted, so a lookup runs
 *   at most once per session and a failed one is retried by a later message.
 *
 * Both are best effort and fail closed: a Redis error skips the lookup (cost
 * over attribution) and never blocks the message. Markers are per contact
 * inbox with a TTL, never per contact forever, so Redis holds only the contacts
 * that wrote recently.
 */

const GOOGLE_CLICK_LOOKUP_DONE_TTL_SECONDS = 24 * 60 * 60
const GOOGLE_CLICK_LOOKUP_ATTEMPT_TTL_SECONDS = 5 * 60
/** Deadline of the channel's profile request; the receive job must not wait longer. */
export const GOOGLE_CLICK_LOOKUP_TIMEOUT_MS = 5000

const doneKey = (contactInboxId: string) =>
  `google-click-lookup:done:${contactInboxId}`
const attemptKey = (contactInboxId: string) =>
  `google-click-lookup:attempt:${contactInboxId}`

/** A real inbound message on a channel that exposes its click through a lookup. */
export const isGoogleClickLookupCandidate = (props: {
  channel: string
  incomingMessage: IncomingMessage
}): boolean =>
  resolveGoogleClickCaptureSource(props.channel) === "profileLookup" &&
  isInboundConversationMessage(props.incomingMessage)

/** `true` when the caller may run the lookup now (and holds the attempt for 5 min). */
export const claimGoogleClickLookup = async (
  contactInboxId: string,
): Promise<boolean> => {
  try {
    if (await distributedStore.exists(doneKey(contactInboxId))) {
      return false
    }
    return await distributedStore.setNumberIfNotExists(
      attemptKey(contactInboxId),
      Date.now(),
      GOOGLE_CLICK_LOOKUP_ATTEMPT_TTL_SECONDS,
    )
  } catch (error) {
    logger.warn(
      { err: error, contactInboxId },
      "claimGoogleClickLookup: Redis failed, skipping the lookup",
    )
    return false
  }
}

/** Call only after the looked-up referral (if any) is persisted. */
export const markGoogleClickLookupDone = async (
  contactInboxId: string,
): Promise<void> => {
  try {
    await distributedStore.setNumber(
      doneKey(contactInboxId),
      Date.now(),
      GOOGLE_CLICK_LOOKUP_DONE_TTL_SECONDS,
    )
  } catch (error) {
    logger.warn(
      { err: error, contactInboxId },
      "markGoogleClickLookupDone: Redis write failed, the lookup may run again",
    )
  }
}
