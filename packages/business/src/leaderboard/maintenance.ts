import { leaderboardRepository } from "@chatbotx.io/database/repositories"
import { logger } from "../logger"
import { leaderboardRankingService } from "./ranking"
import { leaderboardService } from "./service"

/** Redis usage above which the hourly monitor logs an error (see docs/scaling-messaging.md). */
export const LEADERBOARD_REDIS_WARN_BYTES = 512 * 1024 * 1024
/** One ranking above this size is called out on its own. */
export const LEADERBOARD_RANK_WARN_BYTES = 64 * 1024 * 1024

/** Closes every active/paused leaderboard past its end time (runs every minute). */
export async function finishOverdueLeaderboards(now: Date = new Date()) {
  return await leaderboardService.finishOverdue(now)
}

/**
 * Hourly: rebuilds the Redis ranking of every live leaderboard whose daily
 * reset hour is now (self-heals any rare drift, e.g. a subtraction racing an
 * award), then reports Redis memory so growth is visible before it becomes a
 * problem — on a shared `noeviction` Redis a full memory also stops BullMQ.
 */
export async function maintainLeaderboardRankings(now: Date = new Date()) {
  const live = await leaderboardRepository.findAllLive()
  const hour = now.getUTCHours()
  let rebuilt = 0
  for (const leaderboard of live) {
    const resetHour = Number(leaderboard.resetTime.slice(0, 2))
    if (resetHour !== hour) {
      continue
    }
    try {
      if (await leaderboardRankingService.rebuild(leaderboard)) {
        rebuilt += 1
      }
    } catch (err) {
      logger.error(
        { err, leaderboardId: leaderboard.id },
        "leaderboard ranking rebuild failed",
      )
    }
  }

  let report: Awaited<
    ReturnType<typeof leaderboardRankingService.memoryReport>
  > | null = null
  try {
    report = await leaderboardRankingService.memoryReport(
      live.map((leaderboard) => leaderboard.id),
    )
  } catch (err) {
    logger.warn({ err }, "leaderboard memory report failed")
  }
  if (report) {
    const rankingBytes = report.perLeaderboard.reduce(
      (sum, entry) => sum + (entry.bytes ?? 0),
      0,
    )
    const large = report.perLeaderboard.filter(
      (entry) => (entry.bytes ?? 0) > LEADERBOARD_RANK_WARN_BYTES,
    )
    const payload = {
      liveLeaderboards: live.length,
      rankingBytes,
      redisUsedMemory: report.usedMemory,
      large,
    }
    if (
      (report.usedMemory ?? 0) > LEADERBOARD_REDIS_WARN_BYTES ||
      large.length > 0
    ) {
      logger.error(payload, "leaderboard redis memory above threshold")
    } else {
      logger.info(payload, "leaderboard redis memory")
    }
  }
  return { rebuilt, live: live.length }
}
