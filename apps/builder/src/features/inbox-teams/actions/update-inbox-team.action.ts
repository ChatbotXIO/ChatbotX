"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateInboxTeamRequest,
  updateInboxTeamRequest,
} from "../schemas/update-inbox-team.request"

export const updateInboxTeamAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
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

      revalidateTag(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
