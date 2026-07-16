import {
  userQuotaService,
  workspaceLifecycleService,
} from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { allIntegrations } from "../../services/integrations"

const log = getChildLogger("teardown-expired-trial")

export async function teardownExpiredTrial(userId: string): Promise<void> {
  try {
    await workspaceLifecycleService.deactivateOwnerWorkspaces({
      ownerId: userId,
      integrations: allIntegrations,
      teardownLevel: "disconnect",
    })
    await userQuotaService.markChannelsTornDown(userId)
  } catch (err) {
    log.error(
      { err, ownerId: userId },
      "teardownExpiredTrial: owner teardown failed",
    )
    throw err
  }
}
