import { integrationThreadsService } from "@chatbotx.io/business"

export const listIntegrationThreads = async ({
  workspaceId,
}: {
  workspaceId: string
}) => integrationThreadsService.listByWorkspaceId({ workspaceId })
