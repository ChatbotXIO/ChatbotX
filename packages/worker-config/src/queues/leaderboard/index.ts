import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const LeaderboardJobAction = {
  /** Award points for a channel/minigame event to every matching live leaderboard. */
  award: "award",
  /** Take back points when the triggering state is undone (unfollow, left group). */
  reverse: "reverse",
  /** Rebuild the Redis ranking from Postgres. */
  rebuildRank: "rebuildRank",
  /** Send the reward flow to the top N of a finished leaderboard. */
  triggerRewards: "triggerRewards",
} as const

/** Facts about the triggering event that rules filter on. */
export type LeaderboardAwardContext = {
  /** Post/media id for comment rules (already normalized by the caller). */
  postId?: string | null
  /** Length of the comment/message text, for `minChars`. */
  textLength?: number | null
  /** When the commented post was published, for the golden-hour bonus. */
  postPublishedAt?: string | null
  /** Telegram group/channel id for group rules. */
  chatId?: string | null
}

export type LeaderboardJobAward = {
  type: typeof LeaderboardJobAction.award
  data: {
    workspaceId: string
    contactId: string
    inboxId?: string | null
    minigameId?: string | null
    rule: string
    /** Id of the triggering thing; with `eventAt` it makes the award idempotent. */
    sourceRef: string
    /** ISO time of the source event (NOT the enqueue time). */
    eventAt: string
    context?: LeaderboardAwardContext
  }
}

export type LeaderboardJobReverse = {
  type: typeof LeaderboardJobAction.reverse
  data: {
    workspaceId: string
    contactId: string
    inboxId: string
    rule: string
    sourceRef: string
    eventAt: string
    context?: LeaderboardAwardContext
  }
}

export type LeaderboardJobRebuildRank = {
  type: typeof LeaderboardJobAction.rebuildRank
  data: { workspaceId: string; leaderboardId: string }
}

export type LeaderboardJobTriggerRewards = {
  type: typeof LeaderboardJobAction.triggerRewards
  data: { workspaceId: string; leaderboardId: string }
}

export type LeaderboardJobData =
  | LeaderboardJobAward
  | LeaderboardJobReverse
  | LeaderboardJobRebuildRank
  | LeaderboardJobTriggerRewards

/** BullMQ custom ids must not contain ":"; keep them dash-separated. */
/**
 * One job per (host, rule, source event). The host (inbox or minigame) is
 * part of the id: the same sourceRef can occur on two inboxes of a
 * workspace (e.g. one email recipient id per SMTP inbox).
 */
export const leaderboardAwardJobId = (
  workspaceId: string,
  host: string,
  rule: string,
  sourceRef: string,
) => `lb-award-${workspaceId}-${host}-${rule}-${sourceRef}`.replaceAll(":", "-")

export const leaderboardRebuildJobId = (leaderboardId: string) =>
  `lb-rebuild-${leaderboardId}`

export const leaderboardQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<LeaderboardJobData>(queueNames.enum.leaderboard, {
      connection: getQueueConnection(queueNames.enum.leaderboard),
      defaultJobOptions,
    })
