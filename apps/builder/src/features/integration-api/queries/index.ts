import { notFoundException } from "@chatbotx.io/business/errors"
import { integrationApiRepository } from "@chatbotx.io/database/repositories"
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

  const rows = await integrationApiRepository.listByWorkspace(workspaceId)

  return { data: rows.map(toResource) }
}

/** Internal lookup by inboxId — no auth check, for use by the delete/update actions. */
export const findIntegrationApiByInboxId = async ({
  inboxId,
}: {
  inboxId: string
}): Promise<IntegrationApiModel | null> =>
  await integrationApiRepository.findByInboxId(inboxId)

/** Internal lookup scoped to a workspace — throws when missing, for use by actions. */
export const findIntegrationApiByWorkspaceAndId = async ({
  workspaceId,
  id,
}: {
  workspaceId: string
  id: string
}): Promise<IntegrationApiModel> => {
  const row = await integrationApiRepository.findWorkspaceIntegration({
    workspaceId,
    id,
  })
  if (!row) {
    throw notFoundException("Integration API not found")
  }
  return row
}
