"use server"

import { folderService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import {
  type CreateFolderSchema,
  createFolderSchema,
} from "@/features/folders/schema/action"
import { workspaceActionClient } from "@/lib/safe-action"

export const createFolderAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFolderSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateFolderSchema
    }) => {
      await folderService.create({ workspaceId, data: parsedInput })
    },
  )
