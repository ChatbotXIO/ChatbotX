import { BroadcastStatus, prisma } from "@aha.chat/database"
import {
  IntegrationJobAction,
  integrationQueue,
  type ScheduleJobBroadcast,
} from "@aha.chat/worker-config"

export const sendBroadcast = async (data: ScheduleJobBroadcast) => {
  const broadcasts = await prisma.broadcast.findMany({
    where: {
      schedulesAt: {
        lte: data.data.schedulesAt,
      },
      status: BroadcastStatus.scheduled,
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
