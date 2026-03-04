import { db, findOrFail } from "@aha.chat/database/client"
import { broadcastModel } from "@aha.chat/database/schema"
import type { BroadcastModel } from "@aha.chat/database/types"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"

export const sendBroadcast = async (broadcastId: string) => {
  const broadcast = await findOrFail<BroadcastModel>(
    broadcastModel,
    {
      id: broadcastId,
      status: "scheduled",
    },
    "Broadcast not found",
  )

  const contactsOnBroadcasts =
    await db.query.contactsOnBroadcastsModel.findMany({
      where: {
        broadcastId,
      },
    })
  if (contactsOnBroadcasts.length === 0) {
    return
  }

  const conversations = await db.query.conversationModel.findMany({
    where: {
      contactId: {
        in: contactsOnBroadcasts.map((cb) => cb.contactId),
      },
    },
    columns: {
      id: true,
    },
  })

  await Promise.all(
    conversations.map(async (cvst) => {
      await integrationQueue.add(IntegrationJobAction.sendFlow, {
        type: IntegrationJobAction.sendFlow,
        data: {
          flowId: broadcast.flowId,
          conversationId: cvst.id,
        },
      })
    }),
  )
}
