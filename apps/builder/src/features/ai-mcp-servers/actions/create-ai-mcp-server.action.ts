"use server"

import { db } from "@chatbotx.io/database/client"
import { aiMCPServerModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAIMcpServerRequest } from "../schema/action"

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
