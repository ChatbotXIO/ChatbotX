"use server"

import { prisma } from "@aha.chat/database"
import type { FolderModel } from "@aha.chat/database/types"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import {
  type CreateFolderSchema,
  createFolderSchema,
} from "@/features/folders/schemas/create-folder-schema"
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
      let parentFolder: FolderModel | null = null
      if (parsedInput.parentId) {
        parentFolder = await prisma.folder.findFirst({
          where: { id: parsedInput.parentId },
        })
        if (!parentFolder) {
          throw new Error("Parent folder does not exists!")
        }

        paths = [...parentFolder.paths, parentFolder.id]
      }

      await prisma.folder.create({
        data: {
          ...parsedInput,
          chatbotId,
          paths,
        },
      })

      revalidateCacheTags(
        `chatbots:${chatbotId}#folders:${parsedInput.folderType}`,
      )
    },
  )
