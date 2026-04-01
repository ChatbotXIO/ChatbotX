import { db } from "@chatbotx.io/database/client"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"

const ENQUEUE_BULK_SIZE = 500

export const sendBroadcast = async (schedulesAt: Date) => {
  const broadcasts = await db.query.broadcastModel.findMany({
    where: {
      schedulesAt: {
        lte: schedulesAt,
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
    await integrationQueue.addBulk(
      batch.map((broadcast) => ({
        name: IntegrationJobAction.sendBroadcast,
        data: {
          type: IntegrationJobAction.sendBroadcast,
          data: {
            broadcastId: broadcast.id,
          },
        },
        opts: {
          // Deduplicate fan-out when the scheduler job retries.
          jobId: `integration-send-broadcast-${broadcast.id}`,
        },
      })),
    )
    enqueued += batch.length
  }

  return { scanned: broadcasts.length, enqueued }
}
