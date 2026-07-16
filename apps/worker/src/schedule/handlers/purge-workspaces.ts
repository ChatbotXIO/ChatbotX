import { workspaceService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock } from "@chatbotx.io/redis"
import { allIntegrations } from "../../services/integrations"

const log = getChildLogger("purge-workspaces")
const LOCK_TTL_SECONDS = 55

export async function purgeWorkspaces(): Promise<void> {
  await distributedLock.runExclusive({
    key: "schedule:purge-workspaces",
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const deleted = await workspaceService.purgeDueScheduled({
        integrations: allIntegrations,
      })

      if (deleted > 0) {
        log.info({ deleted }, "purgeWorkspaces: workspaces purged")
      }
    },
  })
}
