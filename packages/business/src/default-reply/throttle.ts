import type { DefaultReplyFrequency } from "@chatbotx.io/database/partials"
import {
  type AutomationThrottleClaim,
  automationThrottleService,
} from "../automation-throttle"

/**
 * Rolling-window size (seconds) per {@link DefaultReplyFrequency}. `allTime`
 * maps to `0` — an **unbounded** window that always allows but still records
 * the trigger timestamp (matching v1's `EVERY_TIME`). Recording even under
 * `allTime` means switching to a bounded frequency later throttles from the
 * real last reply instead of granting a bonus one.
 */
export const DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS: Record<
  DefaultReplyFrequency,
  number
> = {
  allTime: 0,
  oncePerHour: 3600,
  oncePerDay: 86_400,
}

/**
 * Default Reply's `subjectId` is a singleton scope — one activation-frequency
 * throttle per `(workspaceId, contactInboxId)`, not per-flow.
 */
const DEFAULT_REPLY_SUBJECT_ID = "0"

export type DefaultReplyThrottleClaimResult = AutomationThrottleClaim["result"]

/**
 * Thin default-reply-facing facade over the generic
 * {@link automationThrottleService}. Pins `throttleType:
 * "defaultReply"` and `subjectId: "0"`, and translates the workspace's
 * configured {@link DefaultReplyFrequency} into `windowSeconds` (`allTime` → the
 * unbounded `0` window) — keeping the worker call site frequency-based.
 */
class DefaultReplyThrottleService {
  tryAcquire(params: {
    workspaceId: string
    contactInboxId: string
    frequency: DefaultReplyFrequency
  }): Promise<AutomationThrottleClaim> {
    return automationThrottleService.tryAcquire({
      workspaceId: params.workspaceId,
      contactInboxId: params.contactInboxId,
      throttleType: "defaultReply",
      subjectId: DEFAULT_REPLY_SUBJECT_ID,
      windowSeconds: DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS[params.frequency],
    })
  }

  /**
   * Only call this for an `acquired` result — the `claimId` and `frequency` it
   * was acquired under must both be threaded through so the release can
   * reconstruct the same Redis fast-path key and CAS-delete the right row.
   */
  release(params: {
    workspaceId: string
    contactInboxId: string
    frequency: DefaultReplyFrequency
    claimId: string
  }): Promise<void> {
    return automationThrottleService.release({
      workspaceId: params.workspaceId,
      contactInboxId: params.contactInboxId,
      throttleType: "defaultReply",
      subjectId: DEFAULT_REPLY_SUBJECT_ID,
      windowSeconds: DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS[params.frequency],
      claimId: params.claimId,
    })
  }
}

export const defaultReplyThrottleService = new DefaultReplyThrottleService()
