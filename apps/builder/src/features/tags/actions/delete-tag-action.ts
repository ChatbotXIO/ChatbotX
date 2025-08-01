"use server"

import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  bulkUpdateIdsRequest,
  chatbotIdRequestParams,
  type BulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"

export const deleteTagAction = chatbotActionClient
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
      await prisma.tag.deleteMany({
        where: {
          id: {
            in: parsedInput.ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#tags`)

      return {
        successful: true,
      }
    },
  )
