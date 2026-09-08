import { aiProviders } from "@chatbotx.io/ai"
import { integrationService } from "@chatbotx.io/business"

type ListAIIntegrationsProps = {
  where: {
    workspaceId: string
  }
}

export async function listAIIntegrations(props: ListAIIntegrationsProps) {
  return await integrationService.listByWorkspaceIdAndTypes({
    workspaceId: props.where.workspaceId,
    integrationTypes: [...aiProviders.options],
  })
}

export async function hasAIIntegration(workspaceId: string): Promise<boolean> {
  return await integrationService.existsByWorkspaceIdAndTypes({
    workspaceId,
    integrationTypes: [...aiProviders.options],
  })
}
