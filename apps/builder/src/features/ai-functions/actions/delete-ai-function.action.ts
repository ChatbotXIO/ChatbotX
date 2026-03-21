"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import type { AIFunctionModel } from "@chatbotx.io/database/types"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteAIFunctionAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id] }) => {
    await findOrFail<AIFunctionModel>(
      aiFunctionModel,
      {
        id,
        chatbotId,
      },
      `AIFunction with id ${id} not found`,
    )

    await db.delete(aiFunctionModel).where(eq(aiFunctionModel.id, id))

    revalidateCacheTags(`chatbots:${chatbotId}#aiFunctions`)
  })
