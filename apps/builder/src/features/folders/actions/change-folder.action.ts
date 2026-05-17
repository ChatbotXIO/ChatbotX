"use server"

import { folderService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { changeFolderRequest } from "../schema/action"

export const changeFolderAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(changeFolderRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs

    await folderService.changeFolder({
      workspaceId,
      folderType: parsedInput.folderType,
      modelIds: parsedInput.modelIds,
      newFolderId: parsedInput.newFolderId,
    })
  })
