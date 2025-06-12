"use server"

import {
  bulkUpdateIdsRequest,
  chatbotIdAndIdRequestParams,
  type ChatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const unblockContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .schema(bulkUpdateIdsRequest)
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
