import { tiktokIntegrationService } from "@chatbotx.io/business"
import type { IntegrationTiktokModel } from "@chatbotx.io/database/types"

export const listIntegrationTiktoks = async ({
  where,
}: {
  where: Partial<Pick<IntegrationTiktokModel, "workspaceId">>
}): Promise<{ data: IntegrationTiktokModel[] }> => {
  const data = await tiktokIntegrationService.listByWorkspace(where)
  return { data }
}

/** Internal lookup by openId — no auth check, for use in webhook handler only */
export const findIntegrationTiktokByOpenId = async ({
  openId,
}: {
  openId: string
}): Promise<IntegrationTiktokModel | null> =>
  await tiktokIntegrationService.findByOpenId(openId)
