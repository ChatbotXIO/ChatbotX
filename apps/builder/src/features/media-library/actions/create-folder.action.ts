"use server"

import { mediaLibraryService } from "@chatbotx.io/business"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

const createFolderInput = z.object({ name: z.string().min(1) })

export const createMediaLibraryFolderAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFolderInput)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await mediaLibraryService.createFolder({
      workspaceId,
      name: parsedInput.name,
    })
  })
