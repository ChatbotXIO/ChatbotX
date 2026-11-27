import type { QueuedTemplateAiFile } from "@chatbotx.io/database/repositories"
import {
  templateAiFileDispatchRepository,
  templateUninstallStateRepository,
} from "@chatbotx.io/database/repositories"
import { aiFileService } from "../ai-file/service"

/** A queued run this old is re-enqueued: the enqueue after commit was lost. */
export const TEMPLATE_AI_FILE_REDISPATCH_AFTER_MS = 10 * 60 * 1000
/** A run still queued after this long is given up on and marked failed. */
export const TEMPLATE_AI_FILE_MAX_QUEUED_MS = 24 * 60 * 60 * 1000
const SWEEP_BATCH = 500

/**
 * Which AI files a template install created still need their embedding job.
 * The install transaction only writes the row (a job queued earlier could
 * outrun the commit), so the worker enqueues right after commit and a sweep
 * covers a lost enqueue. Plain uploads never come through here.
 */
export const templateAiFileDispatchService = {
  async listQueuedForInstallation(
    installationId: string,
  ): Promise<QueuedTemplateAiFile[]> {
    return await templateAiFileDispatchRepository.listQueuedForInstallation(
      installationId,
    )
  },

  /**
   * Queued runs the sweep must act on, split into those to enqueue again and
   * those too old to keep trying (already marked failed by this call).
   */
  async listForSweep(now = Date.now()): Promise<{
    redispatch: QueuedTemplateAiFile[]
    expired: number
  }> {
    const queued = await templateAiFileDispatchRepository.listQueuedBefore({
      queuedBefore: new Date(now - TEMPLATE_AI_FILE_REDISPATCH_AFTER_MS),
      limit: SWEEP_BATCH,
    })
    const expiredBefore = now - TEMPLATE_AI_FILE_MAX_QUEUED_MS
    const redispatch: QueuedTemplateAiFile[] = []
    let expired = 0
    for (const file of queued) {
      if (Date.parse(file.queuedAt) < expiredBefore) {
        const marked = await aiFileService.markProcessingRunFailed({
          aiFileId: file.aiFileId,
          workspaceId: file.workspaceId,
          runId: file.runId,
          code: "enqueueFailed",
        })
        if (marked) {
          expired += 1
          // The installer sees it on the installation, not only in a log: the
          // file stays unindexed until they re-upload or re-sync it.
          await templateUninstallStateRepository.addInstallationWarning({
            installationId: file.installationId,
            warning: {
              category: "aiFiles",
              // Has a translated label ("Background processing could not be queued").
              entityKind: "enqueueFailed",
              path: `aiFile.${file.aiFileId}`,
              value: file.aiFileId,
            },
          })
        }
      } else {
        redispatch.push(file)
      }
    }
    return { redispatch, expired }
  },
}
