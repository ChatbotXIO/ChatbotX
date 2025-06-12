"use server"

import {
  bulkUpdateIdsRequest,
  chatbotIdAndIdRequestParams,
  type BulkUpdateIdsRequest,
  type ChatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteTeamMembersAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .schema(bulkUpdateIdsRequest)
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
