import {
  leaderboardRankingService,
  leaderboardScoringService,
  leaderboardService,
  triggerLeaderboardRewards,
} from "@chatbotx.io/business/leaderboard"
import {
  type LeaderboardRuleKey,
  leaderboardRuleKeys,
} from "@chatbotx.io/database/partials"
import {
  LeaderboardJobAction,
  type LeaderboardJobData,
} from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import { buildLeaderboardFollowerCheck } from "./follower-check"

const parseRule = (rule: string): LeaderboardRuleKey | null => {
  const parsed = leaderboardRuleKeys.safeParse(rule)
  return parsed.success ? parsed.data : null
}

/** Dispatches one `leaderboard` queue job (the caller wraps it in the blocked-owner guard). */
export async function processLeaderboardJob(
  data: LeaderboardJobData,
): Promise<void> {
  switch (data.type) {
    case LeaderboardJobAction.award: {
      const rule = parseRule(data.data.rule)
      if (!rule) {
        logger.warn({ rule: data.data.rule }, "unknown leaderboard rule")
        return
      }
      await leaderboardScoringService.award({
        workspaceId: data.data.workspaceId,
        contactId: data.data.contactId,
        inboxId: data.data.inboxId,
        minigameId: data.data.minigameId,
        rule,
        sourceRef: data.data.sourceRef,
        eventAt: new Date(data.data.eventAt),
        context: data.data.context,
        checkFollower: buildLeaderboardFollowerCheck({
          workspaceId: data.data.workspaceId,
          contactId: data.data.contactId,
          inboxId: data.data.inboxId,
        }),
      })
      return
    }
    case LeaderboardJobAction.reverse: {
      const rule = parseRule(data.data.rule)
      if (!rule) {
        return
      }
      await leaderboardScoringService.reverse({
        workspaceId: data.data.workspaceId,
        contactId: data.data.contactId,
        inboxId: data.data.inboxId,
        rule,
        sourceRef: data.data.sourceRef,
        eventAt: new Date(data.data.eventAt),
        context: data.data.context,
      })
      return
    }
    case LeaderboardJobAction.rebuildRank: {
      const leaderboard = await leaderboardService.findUnscoped(
        data.data.leaderboardId,
      )
      if (!leaderboard || leaderboard.workspaceId !== data.data.workspaceId) {
        return
      }
      await leaderboardRankingService.rebuild(leaderboard)
      return
    }
    case LeaderboardJobAction.triggerRewards: {
      const result = await triggerLeaderboardRewards({
        workspaceId: data.data.workspaceId,
        leaderboardId: data.data.leaderboardId,
      })
      logger.info(
        {
          leaderboardId: data.data.leaderboardId,
          sent: result.sent,
          skipped: result.skipped.length,
          failed: result.failed.length,
        },
        "leaderboard rewards sent",
      )
      if (result.failed.length > 0) {
        // The retry sends only the winners not recorded yet.
        throw new Error(
          `Leaderboard ${data.data.leaderboardId}: ${result.failed.length} reward flow(s) failed to queue`,
        )
      }
      return
    }
    default: {
      const _exhaustive: never = data
      logger.warn({ data: _exhaustive }, "Unhandled leaderboard job type")
    }
  }
}
