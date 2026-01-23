"use server"

import { prisma } from "@aha.chat/database"
import { removeWebhookCache } from "@aha.chat/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteWebhooksAction = chatbotActionClient
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
      await prisma.webhook.deleteMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
      })

      await removeWebhookCache(chatbotId)
    },
  )
