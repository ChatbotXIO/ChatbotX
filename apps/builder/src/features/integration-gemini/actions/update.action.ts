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
      // Check if integration exists, if not create it
      let integrationGemini = await prisma.integrationGemini.findFirst({
        where: { chatbotId },
      })

      if (!integrationGemini) {
        integrationGemini = await prisma.integrationGemini.create({
          data: {
            chatbotId,
            autoReply: false,
          },
        })
      }

      await prisma.integrationGemini.update({
        where: { id: integrationGemini.id },
        data: {
          ...parsedInput,
        },
      })
      return
    },
  )
