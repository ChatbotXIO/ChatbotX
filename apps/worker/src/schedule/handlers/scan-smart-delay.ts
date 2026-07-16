import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import { buildJobId, ENQUEUE_DELAY_MS } from "@chatbotx.io/flow-config"
import { integrationQueue } from "@chatbotx.io/worker-config"
import { endOfMinute } from "date-fns"
import { smartDelayResumeJobFactories } from "../../integration/handlers/smart-delay"
import { logger } from "../../lib/logger"

const ENQUEUE_BULK_SIZE = 500

export const scanSmartDelay = async () => {
  const windowUntil = endOfMinute(new Date(Date.now() + ENQUEUE_DELAY_MS))

  const claimed = await smartDelayService.claimDueRows({ windowUntil })

  if (claimed.length === 0) {
    return { scanned: 0, enqueued: 0 }
  }

  const terminalRows = claimed.filter((row) => !row.nodeId)
  if (terminalRows.length > 0) {
    logger.info(
      { ids: terminalRows.map((row) => row.id) },
      "Smart delay rows without nodeId marked completed (terminal wait)",
    )
  }

  const enqueueable = claimed.filter((row) => row.nodeId)
  let enqueued = 0

  for (let index = 0; index < enqueueable.length; index += ENQUEUE_BULK_SIZE) {
    const batch = enqueueable.slice(index, index + ENQUEUE_BULK_SIZE)
    try {
      await integrationQueue.addBulk(
        batch.map((row) => {
          const job = smartDelayResumeJobFactories[row.type](row)
          return {
            name: job.name,
            data: job.data,
            opts: {
              jobId: buildJobId(row.id),
              delay: Math.max(0, row.triggerAt.getTime() - Date.now()),
            },
          }
        }),
      )

      enqueued += batch.length
    } catch (err) {
      logger.error(
        { err, ids: batch.map((row) => row.id) },
        "Failed to enqueue smart delay batch, resetting to pending for retry",
      )

      try {
        await smartDelayService.resetToPending({
          ids: batch.map((row) => row.id),
        })
      } catch (updateErr) {
        logger.error(
          { err: updateErr, ids: batch.map((row) => row.id) },
          "Failed to reset smart delay batch status to pending",
        )
      }
    }
  }

  return { scanned: claimed.length, enqueued }
}
