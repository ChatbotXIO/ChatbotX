"use server"

import { leaderboardService } from "@chatbotx.io/business/leaderboard"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { resetLeaderboardPointsActionRequest } from "../lib/action-schemas"

/** Danger: sets every score of an active leaderboard to 0 (audited). */
export const resetLeaderboardPointsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(resetLeaderboardPointsActionRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput, ctx }) =>
      await leaderboardService.resetPoints({
        workspaceId,
        id,
        actorUserId: ctx.user.id,
        reason: parsedInput.reason,
      }),
  )
