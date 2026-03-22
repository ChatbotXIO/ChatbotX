"use server"

import { db } from "@aha.chat/database/client"
import { folderModel } from "@aha.chat/database/schema"
import type { FolderModel } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import {
  type CreateFolderSchema,
  createFolderSchema,
} from "@/features/folders/schemas/action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const createFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createFolderSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
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
        chatbotId,
        paths,
      })

      revalidateCacheTags(
        `chatbots:${chatbotId}#folders:${parsedInput.folderType}`,
      )
    },
  )
