"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { invalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAIMcpServerRequest } from "../schemas"

export const createAIMcpServerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAIMcpServerRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs

    await prisma.aIMCPServer.create({
      data: {
        chatbotId,
        ...parsedInput,
      },
    })
    invalidateCacheTags(`chatbots:${chatbotId}#aiMcpServers`)
  })
