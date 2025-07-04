"use server"

import {
  chatbotIdRequestParams,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import {
  type CreateFolderSchema,
  createFolderSchema,
} from "@/features/folders/schemas/create-folder-schema"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import type { FolderModel } from "@ahachat.ai/database/types"
import { revalidateTag } from "next/cache"

export const createFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
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

      revalidateTag(`chatbots:${chatbotId}#folders:${parsedInput.folderType}`)
    },
  )
