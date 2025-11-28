"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { BaseException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateOpenAIRequest } from "../schemas/request"

export const updateIntegrationOpenAIAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateOpenAIRequest)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id], parsedInput }) => {
    const integrationOpenAI = await prisma.integrationOpenAI.findUnique({
      where: { id, chatbotId },
    })
    if (!integrationOpenAI) {
      throw new BaseException("Integration OpenAI not found")
    }

    return await prisma.integrationOpenAI.update({
      where: { id },
      data: parsedInput,
    })
  })
