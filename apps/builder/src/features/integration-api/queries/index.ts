import { db } from "@chatbotx.io/database/client"
import type { IntegrationApiModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ApiResource } from "../schema/resource"

const toResource = (row: IntegrationApiModel): ApiResource => ({
  id: row.id,
  name: row.name,
  tokenPrefix: row.tokenPrefix,
  callbackUrl: row.callbackUrl,
  enabled: row.enabled,
  createdAt: row.createdAt,
})

export const listIntegrationApis = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<{ data: ApiResource[] }> => {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const rows = await db.query.integrationApiModel.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  })

  return { data: rows.map(toResource) }
}

/** Internal lookup by inboxId — no auth check, for use by the delete/update actions. */
export const findIntegrationApiByInboxId = async ({
  inboxId,
}: {
  inboxId: string
}): Promise<IntegrationApiModel | null> =>
  (await db.query.integrationApiModel.findFirst({
    where: { inboxId },
  })) ?? null
