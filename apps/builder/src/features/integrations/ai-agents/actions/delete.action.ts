"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteAIAgentAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput: { ids },
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await prisma.aIAgent.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#aiAgents`)
    },
  )
