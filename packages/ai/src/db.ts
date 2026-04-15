import { db } from "@chatbotx.io/database/client"
import { integrationTypes } from "@chatbotx.io/database/partials"
import type { IntegrationModel } from "@chatbotx.io/database/types"
import { type AIProvider, aiProviders } from "./schemas"

export async function getAllWorkspaceAIIntegrations(
  workspaceId: string,
  allowProviders: AIProvider[],
) {
  const integrations = await db.query.integrationModel.findMany({
    where: {
      workspaceId,
      integrationType: {
        in: [integrationTypes.enum.openai, integrationTypes.enum.gemini],
      },
    },
    with: {
      integrationOpenai: allowProviders.includes(aiProviders.enum.openai),
      integrationGemini: allowProviders.includes(aiProviders.enum.gemini),
    },
  })

  return new Map<AIProvider, IntegrationModel>(
    integrations.map((integration) => [
      integration.integrationType as AIProvider,
      integration,
    ]),
  )
}
