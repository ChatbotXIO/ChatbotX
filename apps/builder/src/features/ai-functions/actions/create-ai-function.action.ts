"use server"

import { db } from "@aha.chat/database/client"
import { aiFunctionModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAIFunctionRequest } from "../schemas"

export const createAIFunctionAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAIFunctionRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs

    await db.insert(aiFunctionModel).values({
      ...parsedInput,
      id: createId(),
      chatbotId,
    })

    revalidateCacheTags(`chatbots:${chatbotId}#aiFunctions`)
  })
