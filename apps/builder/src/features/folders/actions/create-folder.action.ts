"use server"

import { db } from "@chatbotx.io/database/client"
import { folderModel } from "@chatbotx.io/database/schema"
import type { FolderModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import {
  type CreateFolderSchema,
  createFolderSchema,
} from "@/features/folders/schema/action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const createFolderAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFolderSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateFolderSchema
    }) => {
      let paths: string[] = []
      let parentFolder: FolderModel | null | undefined = null
      if (parsedInput.parentId) {
        parentFolder = await db.query.folderModel.findFirst({
          where: { id: parsedInput.parentId },
        })
        if (!parentFolder) {
          throw new Error("Parent folder does not exists!")
        }

        paths = [...parentFolder.paths, parentFolder.id]
      }

      await db.insert(folderModel).values({
        ...parsedInput,
        id: createId(),
        workspaceId,
        paths,
      })

      revalidateCacheTags(
        `workspaces:${workspaceId}#folders:${parsedInput.folderType}`,
      )
    },
  )
