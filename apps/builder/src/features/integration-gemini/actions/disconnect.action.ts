"use server"
import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationGeminiModel } from "@chatbotx.io/database/schema"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectGeminiAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId] }) => {
    const integrationGemini = await findOrFail({
      table: integrationGeminiModel,
      where: { workspaceId },
      message: "Integration Gemini not found",
    })
    await db
      .delete(integrationGeminiModel)
      .where(eq(integrationGeminiModel.id, integrationGemini.id))

    await aiIntegrationService.invalidateCache(
      workspaceId,
      aiProviders.enum.gemini,
    )
  })
