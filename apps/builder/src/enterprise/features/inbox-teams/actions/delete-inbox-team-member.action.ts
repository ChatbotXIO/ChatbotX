"use server"

import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import {
  inboxTeamMemberModel,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import type { InboxTeamModel } from "@chatbotx.io/database/types"
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
      const inboxTeam = await findOrFail<InboxTeamModel>(
        inboxTeamModel,
        {
          id,
          chatbotId,
        },
        "Inbox team not found",
      )

      await db
        .delete(inboxTeamMemberModel)
        .where(
          and(
            eq(inboxTeamMemberModel.inboxTeamId, inboxTeam.id),
            inArray(inboxTeamMemberModel.id, parsedInput.ids),
          ),
        )

      revalidateCacheTags(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
