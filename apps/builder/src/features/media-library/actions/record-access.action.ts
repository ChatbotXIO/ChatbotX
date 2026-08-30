"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { recordMediaLibraryFileAccess } from "../queries/mutations"

export const recordMediaLibraryFileAccessAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(zodBigintAsString())
  .action(async ({ bindArgsParsedInputs, parsedInput: fileId }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await recordMediaLibraryFileAccess({ workspaceId, fileId })
  })
