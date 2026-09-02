"use server"

import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createMediaLibraryFolder } from "../queries/mutations"

const createFolderInput = z.object({ name: z.string().min(1) })

export const createMediaLibraryFolderAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFolderInput)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await createMediaLibraryFolder({
      workspaceId,
      name: parsedInput.name,
    })
  })
