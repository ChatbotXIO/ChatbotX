import { logger } from "../lib/logger"
import {
  cleanupWebhookExecutionsOlderThan,
  evaluateDateTimeWebhooks,
} from "./services/datetime-webhook-evaluator"

export type DateTimeWebhookScanStats = {
  durationMs: number
  failed: number
  matched: number
  total: number
}

export async function scanDateTimeWebhooks(): Promise<DateTimeWebhookScanStats> {
  const startTime = Date.now()
  const startOfMinute = startTime - (startTime % 60_000)

  const results = await evaluateDateTimeWebhooks({ startOfMinute })
  const matched = results.filter((result) => result.matched).length
  const failed = results.filter(
    (result) => !result.matched && !!result.error,
  ).length
  const total = results.length
  const durationMs = Date.now() - startTime

  logger.info(
    `Datetime webhook scan completed: matched=${matched}, failed=${failed}, total=${total}, durationMs=${durationMs}`,
  )

  return {
    durationMs,
    failed,
    matched,
    total,
  }
}

export async function cleanupWebhookExecutions(): Promise<{
  deletedCount: number
}> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const deletedCount = await cleanupWebhookExecutionsOlderThan(ninetyDaysAgo)
  logger.info(
    `Webhook execution cleanup completed: deletedCount=${deletedCount}`,
  )
  return { deletedCount }
}
