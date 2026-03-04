"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { aiAgentModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"

export const deleteAIAgentAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
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
      await db
        .delete(aiAgentModel)
        .where(
          and(
            eq(aiAgentModel.chatbotId, chatbotId),
            inArray(aiAgentModel.id, ids),
          ),
        )

      revalidateCacheTags(`chatbots:${chatbotId}#aiAgents`)
    },
  )
