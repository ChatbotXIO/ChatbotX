import { tiktokIntegrationService } from "@chatbotx.io/business"
import type { IntegrationTiktokModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const listIntegrationTiktoks = async ({
  where,
}: {
  where: Partial<Pick<IntegrationTiktokModel, "workspaceId">>
}): Promise<{ data: IntegrationTiktokModel[] }> => {
  const data = await tiktokIntegrationService.listByWorkspaceId(where)
  return { data }
}

export const findIntegrationTiktok = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationTiktokModel | null> => {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return (await tiktokIntegrationService.findByWorkspaceId(workspaceId)) ?? null
}

export const findIntegrationTiktokByOpenId = async ({
  openId,
}: {
  openId: string
}): Promise<IntegrationTiktokModel | null> =>
  (await tiktokIntegrationService.findByOpenId(openId)) ?? null
