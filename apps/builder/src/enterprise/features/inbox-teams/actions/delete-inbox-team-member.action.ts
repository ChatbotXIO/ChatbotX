"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { inboxTeamMemberModel } from "@aha.chat/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteTeamMembersAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await db
        .delete(inboxTeamMemberModel)
        .where(
          and(
            eq(inboxTeamMemberModel.chatbotId, chatbotId),
            eq(inboxTeamMemberModel.inboxTeamId, id),
            inArray(inboxTeamMemberModel.id, parsedInput.ids),
          ),
        )

      revalidateCacheTags(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
