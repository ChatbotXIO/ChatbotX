import {
  leaderboardRepository,
  leaderboardScoreEventRepository,
} from "@chatbotx.io/database/repositories"
import { leaderboardStore } from "@chatbotx.io/redis"
import { logger } from "../logger"

/**
 * Workspace hard-delete: participants/audit rows cascade with the Leaderboard
 * rows, but the partitioned score history has no FKs and is drained here by
 * primary key (never `ctid`, which repeats across partitions); Redis
 * rankings are dropped too. Kept free of the scoring/ranking modules so the
 * workspace-lifecycle import graph stays Edge-safe.
 */
export async function purgeLeaderboardDataForWorkspace(
  workspaceId: string,
  options: {
    batchSize?: number
    deadlineAt?: number
    deleteBatch?: () => Promise<number>
    maxBatches?: number
  } = {},
): Promise<{ deleted: number; complete: boolean }> {
  const batchSize = options.batchSize ?? 5000
  const maxBatches = options.maxBatches ?? 2000
  const live = await leaderboardRepository.findLiveForWorkspace(workspaceId)
  for (const leaderboard of live) {
    await leaderboardStore.drop(leaderboard.id).catch((err) => {
      logger.warn(
        { err, leaderboardId: leaderboard.id },
        "leaderboard redis drop failed",
      )
    })
  }
  let deleted = 0
  for (let batch = 0; batch < maxBatches; batch++) {
    if (options.deadlineAt && Date.now() >= options.deadlineAt) {
      return { deleted, complete: false }
    }
    const count = await (
      options.deleteBatch ??
      (async () =>
        await leaderboardScoreEventRepository.deleteBatchByWorkspace({
          workspaceId,
          limit: batchSize,
        }))
    )()
    deleted += count
    if (count < batchSize) {
      return { deleted, complete: true }
    }
  }
  return { deleted, complete: false }
}
