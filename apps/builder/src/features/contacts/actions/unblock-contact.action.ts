"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  bulkUpdateIdsRequest,
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const unblockContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      await prisma.contact.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.contact.update({
        where: {
          id,
        },
        data: {
          blockedAt: null,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#contacts`)
      revalidateTag(`chatbots:${chatbotId}#conversations`)
    },
  )
