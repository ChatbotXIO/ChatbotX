"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { leaderboardService } from "@chatbotx.io/business/leaderboard"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { saveLeaderboardRequest } from "../lib/action-schemas"
import { toNestedValidationErrors } from "../lib/validation-errors"
import { buildLeaderboardViewUrl } from "../lib/view-url"

/**
 * Creates the leaderboard as a draft (same service as `leaderboards.create`)
 * and, when `publish` is set, publishes it right away. A publish failure
 * keeps the draft and reports `publishError` so the UI can open it for
 * fixing instead of creating a duplicate on retry.
 */
export const createLeaderboardAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(saveLeaderboardRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const { publish, ...config } = parsedInput
    let created: Awaited<ReturnType<typeof leaderboardService.create>>
    try {
      created = await leaderboardService.create(
        { ...config, workspaceId },
        { buildViewUrl: (id) => buildLeaderboardViewUrl(id) },
      )
    } catch (error) {
      if (isValidationException(error) && error.field) {
        return returnValidationErrors(
          saveLeaderboardRequest,
          toNestedValidationErrors(error.field, error.message) as never,
        )
      }
      throw error
    }
    if (!publish) {
      return { id: created.id, published: false, publishError: null }
    }
    try {
      await leaderboardService.publish({ workspaceId, id: created.id })
      return { id: created.id, published: true, publishError: null }
    } catch (error) {
      if (error instanceof ChatbotXException) {
        return { id: created.id, published: false, publishError: error.message }
      }
      throw error
    }
  })
