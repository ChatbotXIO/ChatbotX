"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  integrationDeepseekModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectDeepSeekAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const integrationDeepseek = await findOrFail({
        table: integrationDeepseekModel,
        where: { workspaceId },
        message: "Integration DeepSeek not found",
      })

      await db
        .delete(integrationModel)
        .where(eq(integrationModel.id, integrationDeepseek.integrationId))

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.deepseek,
      )

      return
    },
  )
