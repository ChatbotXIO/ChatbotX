import {
  finishOverdueLeaderboards as finishOverdue,
  maintainLeaderboardRankings as maintainRankings,
} from "@chatbotx.io/business/leaderboard"
import { logger } from "../../lib/logger"

// Cross-workspace system crons (status sweep + Redis upkeep), like the MAC
// partition cron — not workspace-scoped jobs, so no blocked-owner guard.
// Workspace-scoped follow-ups (reward flows) go through the `leaderboard`
// queue, whose consumer applies the guard.

export async function finishOverdueLeaderboards(): Promise<void> {
  try {
    const { finished } = await finishOverdue()
    if (finished > 0) {
      logger.info({ finished }, "[finishOverdueLeaderboards] finished")
    }
  } catch (err) {
    logger.error({ err }, "[finishOverdueLeaderboards] failed")
  }
}

export async function maintainLeaderboardRankings(): Promise<void> {
  try {
    await maintainRankings()
  } catch (err) {
    logger.error({ err }, "[maintainLeaderboardRankings] failed")
  }
}
