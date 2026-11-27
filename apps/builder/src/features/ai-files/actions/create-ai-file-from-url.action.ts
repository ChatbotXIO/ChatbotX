"use server"

import { aiFileService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toAIFileCreateActionError } from "../lib/create-error-message"
import { assertAIFileActionNotRateLimited } from "../lib/rate-limit"
import { createAIFileFromUrlRequest } from "../schema"

/** Same service call as `aiFiles.create` with a `url`, and the same rate limit. */
export const createAIFileFromUrlAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIFileFromUrlRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    await assertAIFileActionNotRateLimited("create", workspaceId)

    try {
      const file = await aiFileService.create(workspaceId, {
        name: parsedInput.name,
        url: parsedInput.url,
      })
      return {
        id: file.id,
        processingRunError: file.processingRun?.error ?? null,
      }
    } catch (error) {
      throw await toAIFileCreateActionError(error)
    }
  })
