"use server"

import { leaderboardService } from "@chatbotx.io/business/leaderboard"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

// Deleting stays available after trial expiry (read/delete-only workspaces).
export const deleteLeaderboardAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, id] }) =>
      await leaderboardService.delete({ workspaceId, id }),
  )
