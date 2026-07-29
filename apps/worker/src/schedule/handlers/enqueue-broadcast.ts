import { db } from "@chatbotx.io/database/client"
import { ScheduleJobData, scheduleQueue } from "@chatbotx.io/worker-config"
import { startOfMinute } from "date-fns"

const ENQUEUE_BULK_SIZE = 500

export const enqueueBroadcast = async () => {
  const startTime = startOfMinute(new Date().toString())
  const broadcasts = await db.query.broadcastModel.findMany({
    where: {
      schedulesAt: {
        lte: startTime,
      },
      status: "scheduled",
    },
  })

  if (broadcasts.length === 0) {
    return { scanned: 0, enqueued: 0 }
  }

  let enqueued = 0

  for (let index = 0; index < broadcasts.length; index += ENQUEUE_BULK_SIZE) {
    const batch = broadcasts.slice(index, index + ENQUEUE_BULK_SIZE)
    await scheduleQueue.addBulk(
      batch.map((broadcast) => ({
        name: ScheduleJobData.prepareBroadcast,
        data: {
          type: ScheduleJobData.prepareBroadcast,
          data: {
            broadcastId: broadcast.id,
          },
        },
        opts: {
          // Deduplicate fan-out when the scheduler job retries.
          jobId: `schedule-prepare-broadcast-${broadcast.id}`,
          // A deterministic jobId is a Redis dedup key that outlives ANY
          // terminal state, `failed` included. Without these two the first
          // permanent failure turns the key into a tombstone: every later
          // tick's addBulk is silently dropped, so the broadcast stays
          // `scheduled` forever and nothing surfaces the stall.
          removeOnComplete: true,
          removeOnFail: true,
        },
      })),
    )
    enqueued += batch.length
  }

  return { scanned: broadcasts.length, enqueued }
}
