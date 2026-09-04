import { integrationThreadsService } from "@chatbotx.io/business"

export const disconnectThreads = async ({
  workspaceId,
  integrationThreadsId,
}: {
  workspaceId: string
  integrationThreadsId: string
}) => {
  await integrationThreadsService.disconnect({
    workspaceId,
    id: integrationThreadsId,
  })
}
