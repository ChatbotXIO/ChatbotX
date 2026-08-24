"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { deleteMediaLibraryFolder } from "../queries/mutations"

export const deleteMediaLibraryFolderAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(zodBigintAsString())
  .action(async ({ bindArgsParsedInputs, parsedInput: folderId }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await deleteMediaLibraryFolder({ workspaceId, folderId })
  })
