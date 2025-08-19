"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import {
  type EditFolderSchema,
  editFolderSchema,
} from "@/features/folders/schemas/edit-folder-schema"
import { chatbotActionClient } from "@/lib/safe-action"

export const editFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .inputSchema(editFolderSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: EditFolderSchema
    }) => {
      const folder = await prisma.folder.findFirstOrThrow({
        where: {
          chatbotId,
          id,
        },
      })

      await prisma.$transaction(async (tx) => {
        await tx.folder.update({
          where: { id },
          data: parsedInput,
        })

        revalidateTag(`chatbots:${chatbotId}#folders:${folder.folderType}`)
        revalidateTag(`chatbots:${chatbotId}#folders:${folder.id}`)
      })
    },
  )
