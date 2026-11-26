import {
  type SocialTargetForPublish,
  socialPostPaceRepository,
} from "@chatbotx.io/database/repositories"
import {
  PAUSE_AFTER_CONSECUTIVE_LIMIT_ERRORS,
  PUBLISH_PAUSE_MS,
} from "@chatbotx.io/utils/publish-limits"
import { logger } from "../logger"
import { announcePublishConnectionAttention } from "../publish-destination/notify-attention"
import { logSafe } from "./publish-common"

/** Counts an account-level limit answer toward the destination's circuit breaker. Never throws: the result is already stored. */
export const recordLimitErrorSafely = async (
  target: Pick<SocialTargetForPublish, "destinationId" | "id" | "workspaceId">,
  reason: keyof typeof PUBLISH_PAUSE_MS,
  now: Date,
): Promise<void> => {
  try {
    const paused = await socialPostPaceRepository.recordLimitError({
      destinationId: target.destinationId,
      now,
      pauseMs: PUBLISH_PAUSE_MS[reason],
      reason,
      threshold: PAUSE_AFTER_CONSECUTIVE_LIMIT_ERRORS,
      workspaceId: target.workspaceId,
    })
    if (paused) {
      logger.warn(
        {
          destinationId: target.destinationId,
          pausedUntil: paused.pausedUntil,
          reason: paused.reason,
        },
        "social-post publish: destination paused by the circuit breaker",
      )
      await announcePublishConnectionAttention({
        alert: "paused",
        publishDestinationId: target.destinationId,
        transitionKey: String(paused.pausedUntil.getTime()),
        workspaceId: target.workspaceId,
      })
    }
  } catch (err) {
    logger.error(
      { err: logSafe(err), targetId: target.id },
      "social-post publish: recording the limit error failed",
    )
  }
}

/** A non-limit answer ends the streak, not an active pause. Never throws. */
export const resetLimitStreakSafely = async (
  target: Pick<SocialTargetForPublish, "destinationId" | "id" | "workspaceId">,
): Promise<void> => {
  try {
    await socialPostPaceRepository.resetLimitStreak({
      destinationId: target.destinationId,
      workspaceId: target.workspaceId,
    })
  } catch (err) {
    logger.error(
      { err: logSafe(err), targetId: target.id },
      "social-post publish: resetting the limit streak failed",
    )
  }
}

/** A published post ends the destination's streak and any pause. */
export const resetLimitErrorsSafely = async (
  target: Pick<SocialTargetForPublish, "destinationId" | "id" | "workspaceId">,
): Promise<void> => {
  try {
    await socialPostPaceRepository.resetLimitErrors({
      destinationId: target.destinationId,
      workspaceId: target.workspaceId,
    })
  } catch (err) {
    logger.error(
      { err: logSafe(err), targetId: target.id },
      "social-post publish: resetting the limit errors failed",
    )
  }
}
