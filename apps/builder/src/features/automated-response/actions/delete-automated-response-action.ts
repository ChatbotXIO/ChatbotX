"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"

export const deleteAutomatedResponseAction = chatbotActionClient
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
      await prisma.automatedResponse.deleteMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
      })

      revalidateTag(`chatbots:${chatbotId}#automatedResponses`)
    },
  )
