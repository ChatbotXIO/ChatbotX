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

export const archiveConversationAction = chatbotActionClient
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
      await prisma.conversation.updateMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
        data: {
          archivedAt: new Date(),
        },
      })

      revalidateTag(`chatbots:${chatbotId}#conversations`)
    },
  )
