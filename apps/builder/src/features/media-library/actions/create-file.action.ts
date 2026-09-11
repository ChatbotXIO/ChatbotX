"use server"

import { mediaLibraryService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createFileInputSchema } from "../schema"

export const createMediaLibraryFileAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFileInputSchema)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await mediaLibraryService.createFile({ ...parsedInput, workspaceId })
  })
