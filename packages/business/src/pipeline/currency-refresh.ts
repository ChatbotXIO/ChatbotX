import { pipelineRepository } from "@chatbotx.io/database/repositories"
import { RealtimeEventType } from "@chatbotx.io/realtime-protocol"
import { logger } from "../logger"
import { queueWorkspaceRealtimeEvent } from "../platform/realtime-broadcast"

const FOLLOWERS_PAGE_SIZE = 200

/**
 * Tells open boards and inbox panels to refetch after the workspace default
 * currency changed: only pipelines without an override show a new unit. It is
 * the existing "structure changed" event (no item id), so every session that
 * watches a pipeline already knows how to react. Paged so a workspace with
 * many pipelines never loads or publishes them all at once.
 *
 * Imported modules are only used inside the function body: this module sits on
 * the `workspace/service` import cycle that already exists, so nothing here may
 * run at module evaluation.
 */
export async function notifyCurrencyFollowers(
  workspaceId: string,
): Promise<void> {
  try {
    let afterId: string | null = null
    for (;;) {
      const ids = await pipelineRepository.listFollowingCurrencyIds({
        workspaceId,
        afterId,
        limit: FOLLOWERS_PAGE_SIZE,
      })
      await Promise.all(
        ids.map((pipelineId) =>
          queueWorkspaceRealtimeEvent(workspaceId, {
            eventType: RealtimeEventType.pipelineItemChanged,
            data: { pipelineId, change: "updated" },
          }),
        ),
      )
      if (ids.length < FOLLOWERS_PAGE_SIZE) {
        return
      }
      afterId = ids.at(-1) ?? null
    }
  } catch (error) {
    // The settings write already committed; open boards just refresh later.
    logger.error(
      { err: error, workspaceId },
      "Failed to notify currency followers",
    )
  }
}
