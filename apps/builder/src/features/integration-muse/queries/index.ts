import { integrationMuseService } from "@chatbotx.io/business"
import type { IntegrationMuseResource } from "../schema/resource"

export const findIntegrationMuse = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationMuseResource | null> =>
  (await integrationMuseService.findByWorkspaceId(workspaceId)) ?? null
