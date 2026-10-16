"use server"

import { leaderboardService } from "@chatbotx.io/business/leaderboard"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { changeLeaderboardStatusRequest } from "../lib/action-schemas"

/** Publish / pause / resume / finish — the same service calls as the public API. */
export const changeLeaderboardStatusAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(changeLeaderboardStatusRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const row = await leaderboardService[parsedInput.action]({
      workspaceId,
      id,
    })
    return { id: row.id, status: row.status }
  })
