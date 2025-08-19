"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteTeamMembersAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await prisma.inboxTeamMember.deleteMany({
        where: {
          id: {
            in: parsedInput.ids,
          },
          chatbotId,
          inboxTeamId: id,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
