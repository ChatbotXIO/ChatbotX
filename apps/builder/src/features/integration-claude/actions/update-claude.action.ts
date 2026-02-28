"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { BaseException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateClaudeRequest } from "../schemas/request"

export const updateIntegrationClaudeAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateClaudeRequest)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id], parsedInput }) => {
    const integrationClaude = await prisma.integrationClaude.findUnique({
      where: { id, chatbotId },
    })
    if (!integrationClaude) {
      throw new BaseException("Integration Claude not found")
    }

    return await prisma.integrationClaude.update({
      where: { id },
      data: parsedInput,
    })
  })
