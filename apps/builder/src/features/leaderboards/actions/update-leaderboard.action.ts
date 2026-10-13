"use server"

import { leaderboardService } from "@chatbotx.io/business/leaderboard"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { saveLeaderboardRequest } from "../lib/action-schemas"
import { toNestedValidationErrors } from "../lib/validation-errors"

/**
 * Saves the configuration (same service as `leaderboards.update`); a draft
 * saved with `publish` is then published. The service rejects platform,
 * channel and start-time changes after publishing and any edit once finished.
 */
export const updateLeaderboardAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(saveLeaderboardRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const { publish, ...config } = parsedInput
    try {
      const updated = await leaderboardService.update({
        ...config,
        workspaceId,
        id,
      })
      if (publish && updated.status === "draft") {
        await leaderboardService.publish({ workspaceId, id })
        return { id, published: true }
      }
      return { id, published: false }
    } catch (error) {
      if (isValidationException(error) && error.field) {
        return returnValidationErrors(
          saveLeaderboardRequest,
          toNestedValidationErrors(error.field, error.message) as never,
        )
      }
      throw error
    }
  })
