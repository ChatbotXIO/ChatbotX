import {
  reconnectFanOutService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { createPublishFanOutOps } from "@chatbotx.io/channel-registry/publish-fan-out-ops"
import type { LowJobReconnectPublishFanOut } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"

/**
 * The durable remainder of a reconnect fan-out: the same work and guards as the
 * inline run (see `reconnectFanOutService`), idempotent on retry. A single row
 * failure is counted, never thrown, so one bad Page never stalls the rest. Pages
 * left when the run's budget ends continue in a bounded next-hop job (see
 * `reconnectFanOutService.runJob`), never dropped silently.
 */
export async function processReconnectPublishFanOut(
  data: LowJobReconnectPublishFanOut["data"],
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, async () => {
    const result = await reconnectFanOutService.runJob(
      data,
      createPublishFanOutOps({ grantedScopes: data.grantedScopes }),
    )
    logger.info(
      {
        continued: result.enqueued,
        failed: result.failed,
        hop: data.hop,
        refreshed: result.refreshed,
        workspaceId: data.workspaceId,
      },
      "reconnect publish fan-out finished",
    )
  })
}
