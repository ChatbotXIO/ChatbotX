"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { inboxTeamModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteInboxTeamAction = chatbotActionClient
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
      await db
        .delete(inboxTeamModel)
        .where(
          and(
            eq(inboxTeamModel.chatbotId, chatbotId),
            inArray(inboxTeamModel.id, parsedInput.ids),
          ),
        )

      revalidateCacheTags(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
