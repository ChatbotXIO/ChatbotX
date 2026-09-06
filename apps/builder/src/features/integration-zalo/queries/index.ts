import { zaloIntegrationService } from "@chatbotx.io/business"
import type { IntegrationZaloModel } from "@chatbotx.io/database/types"

export const listIntegrationZalo = async ({
  where,
}: {
  where: Partial<Pick<IntegrationZaloModel, "workspaceId" | "id">>
}): Promise<{ data: IntegrationZaloModel[] }> => {
  const data = await zaloIntegrationService.listByWorkspace(where)

  return { data }
}
