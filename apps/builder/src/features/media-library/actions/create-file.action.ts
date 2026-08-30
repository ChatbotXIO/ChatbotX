"use server"

import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createMediaLibraryFile } from "../queries/mutations"
import { createFileInputSchema } from "../schema"

export const createMediaLibraryFileAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFileInputSchema)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await createMediaLibraryFile({ ...parsedInput, workspaceId })
  })
