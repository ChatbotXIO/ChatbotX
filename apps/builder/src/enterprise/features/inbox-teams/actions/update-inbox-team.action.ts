"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxTeamModel } from "@chatbotx.io/database/schema"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateInboxTeamRequest,
  updateInboxTeamRequest,
} from "../schema/action"

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
      const inboxTeam = await findOrFail(
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
