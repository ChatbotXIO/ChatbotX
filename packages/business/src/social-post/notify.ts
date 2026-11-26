import type { SocialTargetOutcome } from "@chatbotx.io/database/repositories"
import { RealtimeEventType } from "@chatbotx.io/realtime-protocol"
import type { SocialPostTargetStatus } from "@chatbotx.io/utils/social-post"
import {
  getPostNotificationJobId,
  NotificationJobAction,
  type NotificationJobPost,
  notificationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { queueWorkspaceRealtimeEvent } from "../platform/realtime-broadcast"

/** What a change tells the Posts pages: which post, which destination (if one), and the status it now has. */
export type SocialPostChange = {
  socialPostId: string
  status: string
  targetId?: string
  workspaceId: string
}

/** The target status a stored outcome leaves behind. */
const TARGET_STATUS_OF_OUTCOME: Record<
  SocialTargetOutcome["kind"],
  SocialPostTargetStatus
> = {
  failed: "failed",
  headPublished: "processing",
  needsReview: "needsReview",
  processing: "processing",
  published: "published",
  retry: "pending",
}

/** The outcomes a person is pushed about, and the job that does it. */
const PUSH_ACTION_OF_OUTCOME: Partial<
  Record<SocialTargetOutcome["kind"], NotificationJobPost["type"]>
> = {
  failed: NotificationJobAction.notifyPostFailed,
  needsReview: NotificationJobAction.notifyPostNeedsReview,
}

/**
 * Tells every open Posts page that a post changed. Call after the write has
 * committed. Best effort: a Redis failure is logged and never reaches the write.
 */
export const emitSocialPostChanged = async (
  change: SocialPostChange,
): Promise<void> => {
  try {
    await queueWorkspaceRealtimeEvent(change.workspaceId, {
      data: {
        socialPostId: change.socialPostId,
        status: change.status,
        ...(change.targetId ? { targetId: change.targetId } : {}),
      },
      eventType: RealtimeEventType.socialPostChanged,
    })
  } catch (err) {
    logger.warn(
      { err, socialPostId: change.socialPostId },
      "social-post: realtime event failed",
    )
  }
}

type SettledTarget = {
  attemptCount: number
  id: string
  socialPostId: string
  workspaceId: string
}

/**
 * After a target's result was stored: the realtime event for every outcome, and
 * a push for `failed` / `needsReview` (job id per target and attempt, so a
 * recovery that stores the same result again pushes once). Best effort.
 */
export const announceSettledTarget = async (
  target: SettledTarget,
  outcome: SocialTargetOutcome,
): Promise<void> => {
  await emitSocialPostChanged({
    socialPostId: target.socialPostId,
    status: TARGET_STATUS_OF_OUTCOME[outcome.kind],
    targetId: target.id,
    workspaceId: target.workspaceId,
  })
  const action = PUSH_ACTION_OF_OUTCOME[outcome.kind]
  if (!action) {
    return
  }
  try {
    await notificationQueue.add(
      action,
      {
        data: {
          attempt: target.attemptCount,
          socialPostId: target.socialPostId,
          targetId: target.id,
          workspaceId: target.workspaceId,
        },
        type: action,
      },
      {
        jobId: getPostNotificationJobId(action, target.id, target.attemptCount),
      },
    )
  } catch (err) {
    logger.warn(
      { err, targetId: target.id },
      "social-post: failed to enqueue the push notification",
    )
  }
}
