"use server"

import { prisma } from "@aha.chat/database"
import type { UserModel } from "@aha.chat/database/types"
import { revalidateTag } from "next/cache"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"

export const deleteAIAgentAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput: { ids },
    }: {
      ctx: { user: UserModel }
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
