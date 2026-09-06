import { integrationOpenAIService } from "@chatbotx.io/business"
import type { IntegrationOpenAIResource } from "../schema/request"

export const findIntegrationOpenAI = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<{
  data: IntegrationOpenAIResource | null
}> => {
  const data = await integrationOpenAIService.findByWorkspaceId(workspaceId)

  return {
    data: data ?? null,
  }
}
