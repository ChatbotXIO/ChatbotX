"use server"
import { aiProviders } from "@chatbotx.io/ai/schemas"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationOpenaiModel,
} from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"

export const disconnectOpenAIAction = authActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
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

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.openai,
      )

      return
    },
  )
