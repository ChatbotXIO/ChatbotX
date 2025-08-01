"use server"

import {
  type ChatbotIdRequestParams,
  type BulkUpdateIdsRequest,
  chatbotIdRequestParams,
  bulkUpdateIdsRequest,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"

export const deleteAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput: { ids },
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await prisma.aITrigger.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
