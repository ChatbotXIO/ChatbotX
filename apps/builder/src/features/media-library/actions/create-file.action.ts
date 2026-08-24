"use server"

import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { createMediaLibraryFile } from "../queries/mutations"
import { createFileInputSchema } from "../schemas"

export const createMediaLibraryFileAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFileInputSchema)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await createMediaLibraryFile({ ...parsedInput, workspaceId })
  })
