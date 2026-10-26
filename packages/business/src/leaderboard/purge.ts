import {
  leaderboardRepository,
  leaderboardScoreEventRepository,
} from "@chatbotx.io/database/repositories"
import { leaderboardStore } from "@chatbotx.io/redis"
import { logger } from "../logger"
import { drainInBatches } from "../workspace-lifecycle/purge-batch"

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
    maxBatches?: number
  } = {},
): Promise<number> {
  const batchSize = options.batchSize ?? 5000
  const live = await leaderboardRepository.findLiveForWorkspace(workspaceId)
  for (const leaderboard of live) {
    await leaderboardStore.drop(leaderboard.id).catch((err) => {
      logger.warn(
        { err, leaderboardId: leaderboard.id },
        "leaderboard redis drop failed",
      )
    })
  }

  return await drainInBatches({
    batchSize,
    deadlineAt: options.deadlineAt ?? Number.MAX_SAFE_INTEGER,
    maxBatches: options.maxBatches ?? 2000,
    runBatch: async (tx) => {
      const count =
        await leaderboardScoreEventRepository.deleteBatchByWorkspace(
          { limit: batchSize, workspaceId },
          tx,
        )
      return { count, value: undefined }
    },
    table: "LeaderboardScoreEvent",
    workspaceId,
  })
}
