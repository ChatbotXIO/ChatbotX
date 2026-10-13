import {
  addUtcMonths,
  countLeaderboardScoreEventDefaultRows,
  createLeaderboardScoreEventPartition,
  dropLeaderboardScoreEventPartition,
  leaderboardRepository,
  listLeaderboardScoreEventPartitions,
} from "@chatbotx.io/database/repositories"
import { logger } from "../logger"

export const LEADERBOARD_PARTITION_CONFIG = {
  /** Months created ahead of the current one. */
  monthsAhead: 2,
  /** Months of score history kept; older months are dropped whole. */
  retentionMonths: 12,
} as const

const startOfUtcMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

export type LeaderboardPartitionMaintenanceResult = {
  created: string[]
  dropped: string[]
  defaultRows: number
}

/**
 * Keeps `LeaderboardScoreEvent` partitions two months ahead and drops months
 * past retention. A month is never dropped while a live (active/paused)
 * leaderboard started in or before it — that leaderboard's history would
 * vanish mid-campaign. Scores and per-rule breakdowns live on
 * `LeaderboardParticipant`, so dropping a month only loses per-event detail.
 */
export async function maintainLeaderboardPartitions(
  now: Date = new Date(),
): Promise<LeaderboardPartitionMaintenanceResult> {
  const currentMonth = startOfUtcMonth(now)
  const created: string[] = []
  for (let i = 0; i <= LEADERBOARD_PARTITION_CONFIG.monthsAhead; i++) {
    const month = addUtcMonths(currentMonth, i)
    if (await createLeaderboardScoreEventPartition(month)) {
      created.push(month.toISOString().slice(0, 7))
    }
  }

  const retentionCutoff = addUtcMonths(
    currentMonth,
    -LEADERBOARD_PARTITION_CONFIG.retentionMonths,
  )
  const earliestLiveStart = await leaderboardRepository.findEarliestLiveStart()
  const keepFrom =
    earliestLiveStart && startOfUtcMonth(earliestLiveStart) < retentionCutoff
      ? startOfUtcMonth(earliestLiveStart)
      : retentionCutoff

  const dropped: string[] = []
  for (const partition of await listLeaderboardScoreEventPartitions()) {
    if (partition.monthStart >= keepFrom) {
      continue
    }
    await dropLeaderboardScoreEventPartition(partition.name)
    dropped.push(partition.name)
  }

  const defaultRows = await countLeaderboardScoreEventDefaultRows()
  if (defaultRows > 0) {
    logger.error(
      { defaultRows },
      "LeaderboardScoreEvent_default holds rows — a monthly partition was missing",
    )
  }
  logger.info(
    { created, dropped, defaultRows },
    "leaderboard partitions maintained",
  )
  return { created, dropped, defaultRows }
}
