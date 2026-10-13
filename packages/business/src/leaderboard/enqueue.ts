import type { LeaderboardRuleKey } from "@chatbotx.io/database/partials"
import {
  type LeaderboardAwardContext,
  LeaderboardJobAction,
  leaderboardAwardJobId,
  leaderboardQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { inboxHasLeaderboardRule, minigameHasLeaderboardRule } from "./scoring"

const isListening = async (
  input: Pick<EnqueueLeaderboardAwardInput, "inboxId" | "minigameId" | "rule">,
): Promise<boolean> => {
  if (input.minigameId) {
    return await minigameHasLeaderboardRule(input.minigameId, input.rule)
  }
  if (input.inboxId) {
    return await inboxHasLeaderboardRule(input.inboxId, input.rule)
  }
  return false
}

/** Completed award jobs are kept a day so a webhook redelivery's re-enqueue is a no-op. */
const AWARD_JOB_RETENTION_SECONDS = 24 * 60 * 60

export type EnqueueLeaderboardAwardInput = {
  workspaceId: string
  contactId: string
  /** Host channel of the event; omit for minigame events. */
  inboxId?: string | null
  minigameId?: string | null
  rule: LeaderboardRuleKey
  /** Stable id of the triggering thing (comment id, message id, recipient id…). */
  sourceRef: string
  /** When the source event happened — NOT now (makes retries idempotent). */
  eventAt: Date
  context?: LeaderboardAwardContext
}

/**
 * The one call every event source makes. Cheap when nothing listens: it
 * checks the cached "live leaderboards with this rule" list first and only
 * then queues a job, so inboxes without a leaderboard pay one cache read.
 * Never throws — scoring must not break message ingestion.
 */
export async function enqueueLeaderboardAward(
  input: EnqueueLeaderboardAwardInput,
): Promise<boolean> {
  try {
    if (!(await isListening(input))) {
      return false
    }
    await leaderboardQueue.add(
      LeaderboardJobAction.award,
      {
        type: LeaderboardJobAction.award,
        data: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          inboxId: input.inboxId ?? null,
          minigameId: input.minigameId ?? null,
          rule: input.rule,
          sourceRef: input.sourceRef,
          eventAt: input.eventAt.toISOString(),
          context: input.context,
        },
      },
      {
        jobId: leaderboardAwardJobId(
          input.workspaceId,
          input.minigameId ? `mg${input.minigameId}` : `in${input.inboxId}`,
          input.rule,
          input.sourceRef,
        ),
        removeOnComplete: { age: AWARD_JOB_RETENTION_SECONDS },
      },
    )
    return true
  } catch (err) {
    logger.warn(
      { err, rule: input.rule, workspaceId: input.workspaceId },
      "failed to enqueue leaderboard award",
    )
    return false
  }
}

/** Takes back a reversible rule (Zalo unfollow, leaving a Telegram group). Never throws. */
export async function enqueueLeaderboardReverse(
  input: Omit<EnqueueLeaderboardAwardInput, "minigameId" | "inboxId"> & {
    inboxId: string
  },
): Promise<boolean> {
  try {
    if (!(await inboxHasLeaderboardRule(input.inboxId, input.rule))) {
      return false
    }
    await leaderboardQueue.add(
      LeaderboardJobAction.reverse,
      {
        type: LeaderboardJobAction.reverse,
        data: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          inboxId: input.inboxId,
          rule: input.rule,
          sourceRef: input.sourceRef,
          eventAt: input.eventAt.toISOString(),
          context: input.context,
        },
      },
      {
        jobId: leaderboardAwardJobId(
          input.workspaceId,
          `in${input.inboxId}`,
          `reverse-${input.rule}`,
          input.sourceRef,
        ),
        removeOnComplete: { age: AWARD_JOB_RETENTION_SECONDS },
      },
    )
    return true
  } catch (err) {
    logger.warn(
      { err, rule: input.rule, workspaceId: input.workspaceId },
      "failed to enqueue leaderboard reverse",
    )
    return false
  }
}
