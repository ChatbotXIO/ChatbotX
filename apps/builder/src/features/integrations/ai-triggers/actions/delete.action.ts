"use server"

import {
  type ChatbotIdRequestParams,
  type DeleteRequestSchema,
  chatbotIdRequestParams,
  deleteRequestSchema,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(deleteRequestSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput: { ids },
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteRequestSchema
    }) => {
      await prisma.aITrigger.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
