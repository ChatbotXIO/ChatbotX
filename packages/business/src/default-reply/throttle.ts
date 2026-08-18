import type { DefaultReplyFrequency } from "@chatbotx.io/database/partials"
import { distributedStore } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { logger } from "../logger"

/**
 * Rolling-window size (seconds) per {@link DefaultReplyFrequency}. `allTime`
 * maps to `null`, meaning "no throttling" — the throttle service short-circuits
 * without ever touching Redis for that frequency.
 */
export const DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS: Record<
  DefaultReplyFrequency,
  number | null
> = {
  allTime: null,
  oncePerHour: 3600,
  oncePerDay: 86_400,
}

/** Redis key for the per-contact/per-channel default-reply throttle claim. */
export function defaultReplyThrottleKey(
  workspaceId: string,
  contactInboxId: string,
): string {
  return `default-reply:last-sent:${workspaceId}:${contactInboxId}`
}

/**
 * Outcome of {@link DefaultReplyThrottleService.tryAcquire}:
 * - `acquired` — this caller created the claim; it owns the window and must
 *   {@link DefaultReplyThrottleService.release} it if the follow-up work fails.
 * - `denied` — another claim already holds the window; the caller must not send.
 * - `bypassed` — no claim exists for this caller (frequency is `allTime`, or
 *   Redis failed and we failed open). Sending is allowed, but there is nothing
 *   to release — releasing here could delete a claim owned by another worker.
 */
export const defaultReplyThrottleClaimResults = [
  "acquired",
  "denied",
  "bypassed",
] as const
export type DefaultReplyThrottleClaimResult =
  (typeof defaultReplyThrottleClaimResults)[number]

class DefaultReplyThrottleService extends BaseService {
  /**
   * Atomically claims a default-reply "slot" for a contact/channel
   * (`contactInboxId`) under the workspace's configured frequency. Uses
   * Redis `SET NX EX` so concurrent inbound messages for the same contact
   * can never both win the claim (no read-then-write race).
   *
   * `allTime` always allows and never touches Redis. Any Redis error
   * **fails open** (allowed) — a missed throttle window is preferable to a
   * bot that stops replying because of an infra hiccup. Both cases report
   * `bypassed` so callers never release a claim they do not own.
   */
  async tryAcquire(params: {
    workspaceId: string
    contactInboxId: string
    frequency: DefaultReplyFrequency
  }): Promise<DefaultReplyThrottleClaimResult> {
    const { workspaceId, contactInboxId, frequency } = params
    const windowSeconds = DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS[frequency]
    if (windowSeconds === null) {
      return "bypassed"
    }

    try {
      const claimed = await distributedStore.setNumberIfNotExists(
        defaultReplyThrottleKey(workspaceId, contactInboxId),
        Date.now(),
        windowSeconds,
      )
      return claimed ? "acquired" : "denied"
    } catch (err) {
      logger.warn(
        { err, workspaceId, contactInboxId, frequency },
        "default-reply: throttle claim failed, failing open",
      )
      return "bypassed"
    }
  }

  /**
   * Best-effort rollback of a claim made by {@link tryAcquire}, used when the
   * caller `acquired` the slot but then failed to actually enqueue the flow
   * (e.g. the queue add threw). Only call this for an `acquired` result —
   * `bypassed` callers own no claim and must not delete someone else's.
   * Swallows Redis errors — a stuck claim just means the contact waits out
   * the window, which is the fail-open default anyway.
   */
  async release(params: {
    workspaceId: string
    contactInboxId: string
  }): Promise<void> {
    const { workspaceId, contactInboxId } = params
    try {
      await distributedStore.delete(
        defaultReplyThrottleKey(workspaceId, contactInboxId),
      )
    } catch (err) {
      logger.warn(
        { err, workspaceId, contactInboxId },
        "default-reply: throttle release failed",
      )
    }
  }
}

export const defaultReplyThrottleService = new DefaultReplyThrottleService()
