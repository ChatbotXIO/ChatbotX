import { workspaceService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { allIntegrations } from "../../services/integrations"

const log = getChildLogger("purge-workspaces")

export async function purgeWorkspaces(): Promise<void> {
  const deleted = await workspaceService.purgeDueScheduled({
    integrations: allIntegrations,
  })

  if (deleted > 0) {
    log.info({ deleted }, "purgeWorkspaces: workspaces purged")
  }
}
