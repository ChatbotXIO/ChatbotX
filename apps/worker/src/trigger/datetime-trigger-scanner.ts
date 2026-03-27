import { logger } from "../lib/logger"
import {
  cleanupOldExecutions,
  evaluateDateTimeTriggers,
} from "./services/datetime-trigger-evaluator"

export type DateTimeTriggerScanStats = {
  durationMs: number
  failed: number
  matched: number
  total: number
}

export async function scanDateTimeTriggers(): Promise<DateTimeTriggerScanStats> {
  const startTime = Date.now()
  const startOfMinute = startTime - (startTime % 60_000)

  const results = await evaluateDateTimeTriggers({
    startOfMinute,
  })
  const matched = results.filter((result) => result.matched).length
  const failed = results.filter(
    (result) => !result.matched && !!result.error,
  ).length
  const total = results.length
  const durationMs = Date.now() - startTime

  logger.info(
    `Datetime trigger scan completed: matched=${matched}, failed=${failed}, total=${total}, durationMs=${durationMs}`,
  )

  return {
    durationMs,
    failed,
    matched,
    total,
  }
}

export async function cleanupTriggerExecutions(): Promise<{
  deletedCount: number
}> {
  const deletedCount = await cleanupOldExecutions()
  logger.info(
    `Trigger execution cleanup completed: deletedCount=${deletedCount}`,
  )
  return { deletedCount }
}
