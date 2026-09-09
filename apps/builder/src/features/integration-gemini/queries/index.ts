import { integrationGeminiService } from "@chatbotx.io/business"
import type { IntegrationGeminiResource } from "../schema/resource"

export const findIntegrationGemini = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationGeminiResource | null> =>
  (await integrationGeminiService.findByWorkspaceId(workspaceId)) ?? null
