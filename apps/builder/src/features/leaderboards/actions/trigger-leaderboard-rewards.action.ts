"use server"

import { triggerLeaderboardRewards } from "@chatbotx.io/business/leaderboard"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

/** Sends the reward flow to the top N of a finished leaderboard (once). */
export const triggerLeaderboardRewardsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id] }) => {
    const result = await triggerLeaderboardRewards({
      workspaceId,
      leaderboardId: id,
      retryFailedInBackground: true,
    })
    return {
      winners: result.winners.length,
      sent: result.sent,
      skipped: result.skipped.length,
    }
  })
