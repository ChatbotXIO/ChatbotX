import { templateAiFileDispatchService } from "@chatbotx.io/business"
import { enqueueProcessAIFile } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

/**
 * An install or sync transaction wrote its AI files with a `queued` run but
 * could not enqueue them; now that it committed, do so. A failure here must not
 * fail the (already committed) job: the redispatch sweep picks the files up.
 */
export const enqueueInstalledAiFiles = async (installationId: string) => {
  try {
    const queued =
      await templateAiFileDispatchService.listQueuedForInstallation(
        installationId,
      )
    for (const { aiFileId, runId } of queued) {
      await enqueueProcessAIFile({ aiFileId, runId })
    }
  } catch (error) {
    logger.warn(
      { err: error, installationId },
      "Could not enqueue template AI files; the sweep will",
    )
  }
}
