import { logger } from "../lib/logger"
import {
  cleanupOldExecutions,
  evaluateDateTimeTriggers,
} from "./services/datetime-trigger-evaluator"

export async function scanDateTimeTriggers(): Promise<void> {
  const startTime = Date.now()
  const startOfMinute = startTime - (startTime % 60_000)
  // logger.info(`Starting datetime trigger scan... ${startOfMinute}`)

  try {
    const _results = await evaluateDateTimeTriggers({
      startOfMinute,
    })

    // const matched = results.filter((r) => r.matched).length
    // const failed = results.filter((r) => !r.matched && r.error).length
    // const total = results.length

    // logger.info(
    //   `Datetime trigger scan completed: ${matched} matched, ${failed} failed, ${total} total evaluated`,
    //   {
    //     duration: Date.now() - startTime,
    //     matched,
    //     failed,
    //     total,
    //   },
    // )
  } catch (error) {
    logger.error(error, "Error scanning datetime triggers")
  }
}

export async function cleanupTriggerExecutions(): Promise<void> {
  logger.info("Starting trigger execution cleanup...")

  try {
    const deletedCount = await cleanupOldExecutions()
    logger.info(`Cleaned up ${deletedCount} old trigger executions`)
  } catch (error) {
    logger.error(error, "Error cleaning up trigger executions")
  }
}
