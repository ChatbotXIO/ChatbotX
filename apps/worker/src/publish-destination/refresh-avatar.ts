import {
  publishDestinationAvatarService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { createPublishAvatarOps } from "@chatbotx.io/channel-registry/publish-avatar-ops"
import type { LowJobRefreshPublishDestinationAvatar } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"

/**
 * Fetches and re-hosts one inbox destination's picture. The service never
 * throws for a network, storage or credential problem (it records the attempt),
 * so BullMQ never retries this job; the list backfill retries a day later.
 */
export async function refreshPublishDestinationAvatar(
  data: LowJobRefreshPublishDestinationAvatar["data"],
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, async () => {
    const outcome = await publishDestinationAvatarService.refresh(
      data,
      createPublishAvatarOps(),
    )
    logger.info(
      {
        outcome,
        publishDestinationId: data.publishDestinationId,
        workspaceId: data.workspaceId,
      },
      "publish destination avatar refreshed",
    )
  })
}
