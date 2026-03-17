import { db, eq, findOrFail } from "@aha.chat/database/client"
import { broadcastModel } from "@aha.chat/database/schema"
import type { BroadcastModel } from "@aha.chat/database/types"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"

export const sendBroadcast = async (broadcastId: string) => {
  async function updateBroadcastStatus(
    broadcastId: string,
    status: "sent" | "failed",
  ) {
    return await db
      .update(broadcastModel)
      .set({
        status,
      })
      .where(eq(broadcastModel.id, broadcastId))
  }

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
    await updateBroadcastStatus(broadcastId, "sent")
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

  try {
    await Promise.allSettled(
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

    await updateBroadcastStatus(broadcastId, "sent")
  } catch (error) {
    console.error("Error sending broadcast", error)

    await updateBroadcastStatus(broadcastId, "failed")
  }
}
