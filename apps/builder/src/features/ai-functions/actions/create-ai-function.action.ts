"use server"

import { db } from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { createAIFunctionRequest } from "../schema/action"

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
