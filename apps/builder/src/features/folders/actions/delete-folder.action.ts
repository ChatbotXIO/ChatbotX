"use server"

import { and, arrayContains, db, eq, or } from "@aha.chat/database/client"
import { folderModel } from "@aha.chat/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await db.transaction(async (tx) => {
        for (const id of parsedInput.ids) {
          const folder = await tx.query.folderModel.findFirst({
            where: {
              chatbotId,
              id,
            },
          })
          if (!folder) {
            continue
          }

          await tx
            .delete(folderModel)
            .where(
              and(
                eq(folderModel.chatbotId, chatbotId),
                or(
                  eq(folderModel.id, id),
                  arrayContains(folderModel.paths, [id]),
                ),
              ),
            )

          revalidateCacheTags([
            `chatbots:${chatbotId}#folders:${folder.folderType}`,
            `chatbots:${chatbotId}#folders:${folder.id}`,
          ])
        }
      })
    },
  )
