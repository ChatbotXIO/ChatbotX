import { lineIntegrationService } from "@chatbotx.io/business"
import type { IntegrationLineModel } from "@chatbotx.io/database/types"
import { toLineChannelResource } from "../lib/to-line-channel-resource"
import type { LineChannelResource } from "../schema/resource"

/** Returns the public projection only: this feeds a client component, so rows must never carry `auth`. */
export const listIntegrationLines = async ({
  where,
}: {
  where: Pick<IntegrationLineModel, "workspaceId">
}): Promise<{ data: LineChannelResource[] }> => {
  const rows = await lineIntegrationService.listByWorkspace({
    workspaceId: where.workspaceId,
  })

  return { data: rows.map(toLineChannelResource) }
}
