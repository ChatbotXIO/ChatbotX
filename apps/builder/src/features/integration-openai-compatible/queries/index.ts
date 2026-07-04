import { integrationOpenaiCompatibleService } from "@chatbotx.io/business"
import {
  type IntegrationOpenaiCompatibleResource,
  mapIntegrationOpenaiCompatibleResource,
} from "../schemas/resource"

export const listIntegrationOpenaiCompatible = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationOpenaiCompatibleResource[]> => {
  const integrations =
    await integrationOpenaiCompatibleService.listByWorkspaceId(workspaceId)

  return integrations.map(mapIntegrationOpenaiCompatibleResource)
}
