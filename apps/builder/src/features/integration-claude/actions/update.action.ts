"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationClaudeModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateClaudeRequest,
  updateClaudeRequest,
} from "../schemas/request"

export const updateIntegrationClaudeAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateClaudeRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: UpdateClaudeRequest
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const integrationClaude = await findOrFail({
        table: integrationClaudeModel,
        where: { workspaceId },
        message: "Integration Claude not found",
      })

      await db
        .update(integrationClaudeModel)
        .set(parsedInput)
        .where(eq(integrationClaudeModel.id, integrationClaude.id))

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.claude,
      )
    },
  )
