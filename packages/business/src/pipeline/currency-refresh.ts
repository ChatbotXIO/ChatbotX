import { pipelineRepository } from "@chatbotx.io/database/repositories"
import { RealtimeEventType } from "@chatbotx.io/realtime-protocol"
import { logger } from "../logger"
import { queueWorkspaceRealtimeEvent } from "../platform/realtime-broadcast"

const PIPELINE_PAGE_SIZE = 200

/**
 * Tells open boards and inbox panels to refetch after the workspace default
 * currency changed. Every pipeline is told, not only those without an
 * override: each one's settings show what "follow the workspace" resolves to.
 * It is the existing "structure changed" event (no item id), so every session
 * that watches a pipeline already knows how to react. Paged so a workspace
 * with many pipelines never loads or publishes them all at once.
 *
 * Imported modules are only used inside the function body: this module sits on
 * the `workspace/service` import cycle that already exists, so nothing here may
 * run at module evaluation.
 */
export async function notifyWorkspaceCurrencyChange(
  workspaceId: string,
): Promise<void> {
  try {
    let afterId: string | null = null
    for (;;) {
      const ids = await pipelineRepository.listIdsPage({
        workspaceId,
        afterId,
        limit: PIPELINE_PAGE_SIZE,
      })
      await Promise.all(
        ids.map((pipelineId) =>
          queueWorkspaceRealtimeEvent(workspaceId, {
            eventType: RealtimeEventType.pipelineItemChanged,
            data: { pipelineId, change: "updated" },
          }),
        ),
      )
      if (ids.length < PIPELINE_PAGE_SIZE) {
        return
      }
      afterId = ids.at(-1) ?? null
    }
  } catch (error) {
    // The settings write already committed; open boards just refresh later.
    logger.error(
      { err: error, workspaceId },
      "Failed to notify pipelines of a workspace currency change",
    )
  }
}
