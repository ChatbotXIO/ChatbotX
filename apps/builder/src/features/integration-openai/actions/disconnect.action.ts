"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationOpenaiModel,
} from "@chatbotx.io/database/schema"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"

export const disconnectOpenAIAction = authActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationOpenAI = await findOrFail({
        table: integrationOpenaiModel,
        where: {
          workspaceId,
        },
        message: "Integration OpenAI not found",
      })

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationModel)
          .where(eq(integrationModel.id, integrationOpenAI.integrationId))
      })

      return
    },
  )
