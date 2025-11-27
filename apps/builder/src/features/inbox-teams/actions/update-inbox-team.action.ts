"use server"

import { prisma } from "@aha.chat/database"
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
      await prisma.inboxTeam.update({
        where: {
          id,
          chatbotId,
        },
        data: parsedInput,
      })

      revalidateCacheTags(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
