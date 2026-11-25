import "server-only"

import {
  type FanOutInput,
  type FanOutResult,
  reconnectFanOutService,
} from "@chatbotx.io/business"
import { createPublishFanOutOps } from "@chatbotx.io/channel-registry/publish-fan-out-ops"
import { logger } from "@/lib/log"

/**
 * Runs the reconnect fan-out after the selected row committed. Best effort by
 * contract: it never throws, so it can never fail the reconnect that already
 * succeeded. Skipped when the reconnecting Facebook user id is unknown: rows
 * are matched on their stored authorizer, never guessed. A remainder beyond the
 * inline budget is handed to a durable job by the service.
 */
export async function runReconnectFanOut(
  input: Omit<FanOutInput, "facebookUserId"> & {
    facebookUserId: string | undefined
  },
): Promise<FanOutResult | null> {
  const { facebookUserId } = input
  if (!facebookUserId) {
    logger.info(
      { workspaceId: input.workspaceId },
      "Reconnect fan-out skipped: the authorizing Facebook user is unknown",
    )
    return null
  }
  try {
    return await reconnectFanOutService.fanOut(
      { ...input, facebookUserId },
      createPublishFanOutOps({ grantedScopes: input.grantedScopes }),
    )
  } catch (err) {
    logger.error(
      { err, workspaceId: input.workspaceId },
      "Reconnect fan-out failed",
    )
    return null
  }
}
