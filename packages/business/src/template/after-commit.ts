import { logger } from "../logger"
import type { AfterCommitTask, TemplateInstallWarning } from "./adapters/types"

/**
 * Runs the tasks adapters queued during an install or sync, strictly after its
 * transaction committed. A task reports an expected failure as a warning; one
 * that throws is logged and skipped so it can never fail a committed install.
 */
export const runAfterCommitTasks = async (
  tasks: readonly AfterCommitTask[],
): Promise<TemplateInstallWarning[]> => {
  const warnings: TemplateInstallWarning[] = []
  for (const task of tasks) {
    try {
      const warning = await task()
      if (warning) {
        warnings.push(warning)
      }
    } catch (error) {
      logger.error({ err: error }, "template: an after-commit task failed")
    }
  }
  return warnings
}
