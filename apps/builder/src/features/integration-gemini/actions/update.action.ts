"use server"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { auditService } from "@chatbotx.io/business/audit"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationGeminiModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateGeminiRequest,
  updateGeminiRequest,
} from "../schemas/request"

export const updateGeminiAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateGeminiRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: UpdateGeminiRequest
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const integrationGemini = await findOrFail({
        table: integrationGeminiModel,
        where: { workspaceId },
        message: "Integration Gemini not found",
      })

      await db
        .update(integrationGeminiModel)
        .set(parsedInput)
        .where(eq(integrationGeminiModel.id, integrationGemini.id))

      await aiIntegrationService.invalidateCache(workspaceId, "gemini")

      await auditService.record({
        workspaceId,
        action: "update",
        detail: "updated the Gemini integration configuration",
      })
    },
  )
