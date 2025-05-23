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
import type { Folder } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const createFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(createFolderSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateFolderSchema
    }) => {
      let paths: string[] = []
      let parentFolder: Folder | null = null
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
