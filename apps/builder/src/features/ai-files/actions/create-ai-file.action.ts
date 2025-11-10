"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAiFileRequest } from "../schemas"

export const createAiFileAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAiFileRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs

    await prisma.aIFile.create({
      data: {
        chatbotId,
        ...parsedInput,
      },
    })

    revalidateCacheTags(`chatbots:${chatbotId}#aiFiles`)
  })
