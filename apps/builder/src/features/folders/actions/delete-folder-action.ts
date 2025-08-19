"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
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

          revalidateTag(`chatbots:${chatbotId}#folders:${folder.folderType}`)
          revalidateTag(`chatbots:${chatbotId}#folders:${folder.id}`)
        }
      })
    },
  )
