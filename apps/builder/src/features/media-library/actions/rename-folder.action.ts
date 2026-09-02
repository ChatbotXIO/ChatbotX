"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { renameMediaLibraryFolder } from "../queries/mutations"

const renameFolderInput = z.object({
  folderId: zodBigintAsString(),
  name: z.string().min(1),
})

export const renameMediaLibraryFolderAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(renameFolderInput)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await renameMediaLibraryFolder({
      workspaceId,
      folderId: parsedInput.folderId,
      name: parsedInput.name,
    })
  })
