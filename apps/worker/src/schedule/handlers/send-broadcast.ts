import { db } from "@aha.chat/database/client"
import {
  IntegrationJobAction,
  integrationQueue,
  type ScheduleJobBroadcast,
} from "@aha.chat/worker-config"

export const sendBroadcast = async (data: ScheduleJobBroadcast) => {
  const broadcasts = await db.query.broadcastModel.findMany({
    where: {
      schedulesAt: {
        lte: data.data.schedulesAt,
      },
      status: "scheduled",
    },
  })

  if (broadcasts.length === 0) {
    return
  }

  await Promise.all(
    broadcasts.map(async (broadcast) => {
      await integrationQueue.add(IntegrationJobAction.sendBroadcast, {
        type: IntegrationJobAction.sendBroadcast,
        data: {
          broadcastId: broadcast.id,
        },
      })
    }),
  )
}
