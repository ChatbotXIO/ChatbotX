"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { integrationOpenAIModel } from "@aha.chat/database/schema"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateOpenAIRequest } from "../schemas/request"

export const updateIntegrationOpenAIAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateOpenAIRequest)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id], parsedInput }) => {
    const integrationOpenAI = await findOrFail(
      integrationOpenAIModel,
      {
        id,
        chatbotId,
      },
      "Integration OpenAI not found",
    )

    return await db
      .update(integrationOpenAIModel)
      .set(parsedInput)
      .where(eq(integrationOpenAIModel.id, integrationOpenAI.id))
      .returning()
      .then((result) => result[0])
  })
