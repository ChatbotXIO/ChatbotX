"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  integrationClaudeModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectClaudeAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const integrationClaude = await findOrFail({
        table: integrationClaudeModel,
        where: { workspaceId },
        message: "Integration Claude not found",
      })

      await db
        .delete(integrationModel)
        .where(eq(integrationModel.id, integrationClaude.integrationId))

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.claude,
      )

      return
    },
  )
