import {
  type IntegrationZaloResource,
  zaloIntegrationService,
} from "@chatbotx.io/business"
import type { IntegrationZaloModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const findIntegrationZalo = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationZaloResource | null> => {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return (await zaloIntegrationService.findByWorkspaceId(workspaceId)) ?? null
}

export const listIntegrationZalo = async ({
  where,
}: {
  where: Partial<Pick<IntegrationZaloModel, "workspaceId" | "id">>
}): Promise<{ data: IntegrationZaloModel[] }> => {
  const data = await zaloIntegrationService.listByWorkspace(where)

  return { data }
}
