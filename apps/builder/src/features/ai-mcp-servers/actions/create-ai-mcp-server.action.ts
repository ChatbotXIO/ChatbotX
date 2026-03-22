"use server"

import { db } from "@aha.chat/database/client"
import { aiMCPServerModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAIMcpServerRequest } from "../schemas"

export const createAIMcpServerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAIMcpServerRequest)
  .action(async ({ bindArgsParsedInputs: [chatbotId], parsedInput }) => {
    await db.insert(aiMCPServerModel).values({
      ...parsedInput,
      id: createId(),
      chatbotId,
    })

    revalidateCacheTags(`chatbots:${chatbotId}#aiMcpServers`)
  })
