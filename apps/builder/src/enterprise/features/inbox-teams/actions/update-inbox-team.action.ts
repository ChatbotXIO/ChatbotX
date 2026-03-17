"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { inboxTeamModel } from "@aha.chat/database/schema"
import type { InboxTeamModel } from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateInboxTeamRequest,
  updateInboxTeamRequest,
} from "../schemas/update-inbox-team.request"

export const updateInboxTeamAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateInboxTeamRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateInboxTeamRequest
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
        .update(inboxTeamModel)
        .set(parsedInput)
        .where(eq(inboxTeamModel.id, inboxTeam.id))

      revalidateCacheTags(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
