import { templateSyncRequestService } from "@chatbotx.io/business"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import {
  enqueueFanOutTemplateUpdate,
  enqueueSyncTemplateInstallation,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

type FanOutTemplateUpdateData = {
  templateId: string
  workspaceId: string
  version: number
  afterId?: string | null
}

const ENQUEUE_CONCURRENCY = 10

/**
 * One batch of the auto-update fan-out: a sync row per following installation
 * behind `version` (insert-or-ignore, so a repeat is harmless), each enqueued
 * under its own deterministic job id, then the next batch. A sync whose
 * enqueue fails stays `pending` and the sweep re-dispatches it.
 */
export async function fanOutTemplateUpdate(data: FanOutTemplateUpdateData) {
  const { syncs, nextAfterId } =
    await templateSyncRequestService.fanOutAutoUpdate({
      templateId: data.templateId,
      version: data.version,
      afterId: data.afterId,
    })
  const results = await mapWithConcurrency(
    syncs,
    ENQUEUE_CONCURRENCY,
    ({ id, workspaceId }) =>
      enqueueSyncTemplateInstallation({ syncId: id, workspaceId }),
  )
  const failed = results.filter(({ status }) => status === "rejected").length
  if (failed > 0) {
    logger.error(
      { failed, templateId: data.templateId },
      "Could not enqueue some template syncs; the sweep will",
    )
  }
  if (nextAfterId) {
    await enqueueFanOutTemplateUpdate({ ...data, afterId: nextAfterId })
  }
}
