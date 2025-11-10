"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateAIFunctionRequest } from "../schemas"

export const updateAIFunctionAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateAIFunctionRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs
    const { id, ...data } = parsedInput

    await prisma.aIFunction.findFirstOrThrow({
      where: {
        id,
        chatbotId,
      },
    })

    await prisma.aIFunction.update({
      where: {
        id,
        chatbotId,
      },
      data,
    })
    revalidateCacheTags(`chatbots:${chatbotId}#aiFunctions`)
  })
