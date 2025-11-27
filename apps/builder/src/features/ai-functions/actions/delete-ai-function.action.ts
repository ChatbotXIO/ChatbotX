"use server"

import { prisma } from "@aha.chat/database"
import { z } from "zod"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

const deleteAIFunctionRequest = z.object({
  id: z.string(),
})

export const deleteAIFunctionAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(deleteAIFunctionRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs

    await prisma.aIFunction.delete({
      where: {
        id: parsedInput.id,
        chatbotId,
      },
    })
    revalidateCacheTags(`chatbots:${chatbotId}#aiFunctions`)
  })
