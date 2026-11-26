import { fileRepository } from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import { withPurgeTimeouts } from "../workspace-lifecycle/purge-batch"

/** Export files deleted per batch of a workspace purge. */
const EXPORT_FILE_PURGE_BATCH_SIZE = 100
/** Batches one purge pass runs; what is left is finished by the next pass. */
const EXPORT_FILE_PURGE_MAX_BATCHES = 50

const isPastDeadline = (deadlineAt: number | undefined): boolean =>
  deadlineAt !== undefined && Date.now() >= deadlineAt

class ExportFileService extends BaseService {
  /**
   * Deletes a workspace's export files of every kind: each stored object
   * first, then its row. The final workspace cascade drops the rows but never
   * the objects, so without this the CSVs (which can hold contact data) would
   * outlive the workspace. Bounded: a batch at a time, a limited number of
   * batches per pass. A failed object delete stops the pass with the row kept,
   * so the next pass retries it (S3 treats a missing object as deleted).
   * The database statements run under the purge timeouts and the pass stops,
   * incomplete, once `deadlineAt` (epoch ms) has passed; the storage call is
   * made outside any transaction.
   */
  async purgeWorkspace(input: {
    batchSize?: number
    deadlineAt?: number
    maxBatches?: number
    workspaceId: string
  }): Promise<{ complete: boolean; deleted: number }> {
    const batchSize = input.batchSize ?? EXPORT_FILE_PURGE_BATCH_SIZE
    const maxBatches = input.maxBatches ?? EXPORT_FILE_PURGE_MAX_BATCHES
    let deleted = 0

    for (let batch = 0; batch < maxBatches; batch++) {
      if (isPastDeadline(input.deadlineAt)) {
        return { complete: false, deleted }
      }
      const files = await withPurgeTimeouts({
        fn: (tx) =>
          fileRepository.listWorkspaceExportsBatch(
            { limit: batchSize, workspaceId: input.workspaceId },
            tx,
          ),
        table: "File",
        workspaceId: input.workspaceId,
      })
      for (const file of files) {
        if (isPastDeadline(input.deadlineAt)) {
          return { complete: false, deleted }
        }
        try {
          await uploader.deleteObject(file.path)
        } catch (err) {
          logger.warn(
            { err, fileId: file.id, workspaceId: input.workspaceId },
            "exportFile.purgeWorkspace: could not delete the export file, retrying on the next pass",
          )
          return { complete: false, deleted }
        }
        await withPurgeTimeouts({
          fn: (tx) => fileRepository.deleteById({ id: file.id }, tx),
          table: "File",
          workspaceId: input.workspaceId,
        })
        deleted++
      }
      if (files.length < batchSize) {
        return { complete: true, deleted }
      }
    }
    return { complete: false, deleted }
  }
}

export const exportFileService = new ExportFileService()
