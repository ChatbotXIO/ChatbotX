import { instagramIntegrationService } from "@chatbotx.io/business"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"

export const findIntegrationInstagram = async (where: {
  workspaceId: string
  id: string
}): Promise<IntegrationInstagramModel> => {
  const integration =
    await instagramIntegrationService.findByIdForWorkspace(where)

  if (!integration) {
    throw new Error("Integration Instagram not found")
  }

  return integration
}

export const listIntegrationInstagrams = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<{ data: IntegrationInstagramModel[] }> => {
  const data = await instagramIntegrationService.listForWorkspace({
    workspaceId,
  })

  return { data }
}
