"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { type UpdateGeminiRequest, updateGeminiRequest } from "../schemas"

export const updateGeminiAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateGeminiRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: UpdateGeminiRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationGemini = await prisma.integrationGemini.findFirstOrThrow(
        {
          where: { chatbotId },
        },
      )

      await prisma.integrationGemini.update({
        where: { id: integrationGemini.id },
        data: {
          ...parsedInput,
        },
      })
      return
    },
  )
