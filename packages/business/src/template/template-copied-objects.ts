import { uploader } from "@chatbotx.io/filesystem"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import { logger } from "../logger"

/**
 * Best-effort cleanup of storage objects an aborted install or sync copied:
 * the transaction rolled their rows back, so nothing references them anymore.
 * A failed delete is only logged; it must not mask the original error.
 */
export const deleteCopiedObjects = async (paths: string[]): Promise<void> => {
  const results = await mapWithConcurrency(paths, 4, (path) =>
    uploader.deleteObject(path),
  )
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      logger.warn(
        { err: result.reason, path: paths[index] },
        "Template: could not delete a copied object after rollback",
      )
    }
  }
}
