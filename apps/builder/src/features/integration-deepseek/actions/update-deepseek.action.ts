"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { BaseException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateDeepSeekRequest } from "../schemas/request"

export const updateIntegrationDeepSeekAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateDeepSeekRequest)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id], parsedInput }) => {
    const integrationDeepSeek = await prisma.integrationDeepSeek.findUnique({
      where: { id, chatbotId },
    })
    if (!integrationDeepSeek) {
      throw new BaseException("Integration DeepSeek not found")
    }

    return await prisma.integrationDeepSeek.update({
      where: { id },
      data: parsedInput,
    })
  })
