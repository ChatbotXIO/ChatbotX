"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { folderModel } from "@aha.chat/database/schema"
import type { FolderModel } from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import {
  type EditFolderSchema,
  editFolderSchema,
} from "@/features/folders/schemas/action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const editFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(editFolderSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: EditFolderSchema
    }) => {
      const folder = await findOrFail<FolderModel>(
        folderModel,
        {
          chatbotId,
          id,
        },
        "Folder not found",
      )

      await db.transaction(async (tx) => {
        await tx
          .update(folderModel)
          .set(parsedInput)
          .where(eq(folderModel.id, folder.id))

        revalidateCacheTags([
          `chatbots:${chatbotId}#folders:${folder.folderType}`,
          `chatbots:${chatbotId}#folders:${folder.id}`,
        ])
      })
    },
  )
