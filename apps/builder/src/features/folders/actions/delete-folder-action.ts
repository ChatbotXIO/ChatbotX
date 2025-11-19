"use server"

import { prisma } from "@aha.chat/database"
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
      await prisma.$transaction(async (tx) => {
        for (const id of parsedInput.ids) {
          const folder = await tx.folder.findFirst({
            where: {
              chatbotId,
              id,
            },
          })
          if (!folder) {
            continue
          }

          await tx.folder.deleteMany({
            where: {
              chatbotId,
              OR: [
                {
                  id,
                },
                {
                  paths: {
                    has: id,
                  },
                },
              ],
            },
          })

          revalidateCacheTags([
            `chatbots:${chatbotId}#folders:${folder.folderType}`,
            `chatbots:${chatbotId}#folders:${folder.id}`,
          ])
        }
      })
    },
  )
