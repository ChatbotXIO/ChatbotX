"use server"

import { searchAIFiles } from "@chatbotx.io/ai/server"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertAIFileActionNotRateLimited } from "../lib/rate-limit"
import { searchAIFilesRequest } from "../schema/public"

/** Same retrieval as `aiFiles.search`, behind the same per-workspace bucket. */
export const searchAIFilesAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(searchAIFilesRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    await assertAIFileActionNotRateLimited("search", workspaceId)
    return await searchAIFiles({ ...parsedInput, workspaceId })
  })
