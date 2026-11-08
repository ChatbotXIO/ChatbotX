import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import { enqueueInstallTemplate } from "@chatbotx.io/worker-config"
import { logger } from "../logger"

/**
 * After a workspace's creation commits, enqueues the installs staged for it
 * (a share link's template, or the white-label default). Idempotent: with nothing pending it is one empty
 * read, and a repeated enqueue is de-duplicated by the deterministic job id
 * (and the worker's lease claim). A lost enqueue is recovered by the
 * installation sweep within minutes, so a failure here never fails the caller.
 */
export const dispatchStagedInstalls = async (
  workspaceId: string,
): Promise<void> => {
  try {
    const installationIds =
      await templateInstallationRepository.listPendingIds(workspaceId)
    await Promise.all(
      installationIds.map((installationId) =>
        enqueueInstallTemplate({ installationId, workspaceId }),
      ),
    )
  } catch (err) {
    logger.error(
      { err, workspaceId },
      "Failed to dispatch staged template installs",
    )
  }
}
