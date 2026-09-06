import { aiProviders } from "@chatbotx.io/ai"
import { integrationService } from "@chatbotx.io/business"

export async function hasAIIntegration(workspaceId: string): Promise<boolean> {
  return await integrationService.hasIntegrationOfTypes({
    workspaceId,
    integrationTypes: [...aiProviders.options],
  })
}
