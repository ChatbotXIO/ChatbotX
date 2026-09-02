import { integrationOpenRouterService } from "@chatbotx.io/business"
import type { IntegrationOpenrouterResource } from "../schema/resource"

export const findIntegrationOpenRouter = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationOpenrouterResource | null> =>
  (await integrationOpenRouterService.findByWorkspaceId(workspaceId)) ?? null
