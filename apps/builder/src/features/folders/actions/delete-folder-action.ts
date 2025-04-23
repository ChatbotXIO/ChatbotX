"use server"

import {
  bulkUpdateIdsRequest,
  chatbotIdRequestParams,
  type BulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await prisma.$transaction(async (tx) => {
        for (const id in parsedInput.ids) {
          const folder = await tx.folder.findFirst({
            where: {
              chatbotId,
              id,
            },
          })
          if (!folder) continue

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
