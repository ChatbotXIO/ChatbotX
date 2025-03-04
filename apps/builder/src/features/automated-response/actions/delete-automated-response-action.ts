"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
  type DeleteRequestSchema,
  deleteRequestSchema,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const deleteAutomatedResponseAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(deleteRequestSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteRequestSchema
    }) => {
      await prisma.automatedResponse.deleteMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
      })

      revalidateTag(`chatbot:${chatbotId}:automatedResponses`)
    },
  )
