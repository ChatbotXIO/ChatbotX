"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationOpenAIModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationOpenAIModel } from "@chatbotx.io/database/types"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"

export const disconnectOpenAIAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationOpenAI = await findOrFail<IntegrationOpenAIModel>(
        integrationOpenAIModel,
        {
          chatbotId,
        },
        "Integration OpenAI not found",
      )

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationModel)
          .where(eq(integrationModel.id, integrationOpenAI.integrationId))
      })

      return
    },
  )
