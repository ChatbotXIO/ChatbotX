"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { moveMediaLibraryFiles } from "../queries/mutations"

const moveFilesInput = z.object({
  fileIds: z.array(zodBigintAsString()).min(1),
  folderId: zodBigintAsString().nullish(),
})

export const moveMediaLibraryFilesAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(moveFilesInput)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await moveMediaLibraryFiles({
      workspaceId,
      fileIds: parsedInput.fileIds,
      folderId: parsedInput.folderId,
    })
  })
