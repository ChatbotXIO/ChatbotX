"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import type { AIFunctionModel } from "@chatbotx.io/database/types"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateAIFunctionRequest } from "../schemas"

export const updateAIFunctionAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateAIFunctionRequest)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id], parsedInput }) => {
    const aiFunction = await findOrFail<AIFunctionModel>(
      aiFunctionModel,
      {
        id,
        chatbotId,
      },
      `AIFunction with id ${id} not found`,
    )

    await db
      .update(aiFunctionModel)
      .set(parsedInput)
      .where(eq(aiFunctionModel.id, aiFunction.id))

    revalidateCacheTags(`chatbots:${chatbotId}#aiFunctions`)
  })
