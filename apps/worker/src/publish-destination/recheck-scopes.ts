import {
  emitSocialPostChanged,
  publishScopeRecheckService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { createPublishScopeOps } from "@chatbotx.io/channel-registry/publish-scope-ops"
import { SCOPES_RECHECKED_STATUS } from "@chatbotx.io/utils/publish-destination"
import type { LowJobRecheckPublishDestinationScopes } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"

/**
 * Re-reads the claimed destinations' permissions from the platform, one after
 * the other, stopping at the first rate-limit answer, then tells the open
 * Connect tab once when anything was written. Never retries (the next open of
 * the tab asks again, after the claims expire): any failure is logged by the
 * service and leaves the stored permissions as they were.
 */
export async function recheckPublishDestinationScopes(
  data: LowJobRecheckPublishDestinationScopes["data"],
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, async () => {
    const result = await publishScopeRecheckService.runScopeRecheck(
      data,
      createPublishScopeOps(),
    )
    logger.info(
      {
        destinations: data.destinationIds.length,
        rateLimited: result.rateLimited,
        workspaceId: data.workspaceId,
        written: result.written,
      },
      "publish destination scopes re-checked",
    )
    if (result.written) {
      await emitSocialPostChanged({
        socialPostId: "",
        status: SCOPES_RECHECKED_STATUS,
        workspaceId: data.workspaceId,
      })
    }
  })
}
