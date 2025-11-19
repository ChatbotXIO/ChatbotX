"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAIFunctionRequest } from "../schemas"

export const createAIFunctionAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAIFunctionRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs

    await prisma.aIFunction.create({
      data: {
        chatbotId,
        ...parsedInput,
      },
    })
    revalidateCacheTags(`chatbots:${chatbotId}#aiFunctions`)
  })
