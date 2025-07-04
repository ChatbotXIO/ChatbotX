"use server"

import {
  bulkUpdateIdsRequest,
  chatbotIdRequestParams,
  type BulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteInboxTeamAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await prisma.inboxTeam.deleteMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
      })

      revalidateTag(`chatbots:${chatbotId}#inboxTeams`)

      return {
        successful: true,
      }
    },
  )
