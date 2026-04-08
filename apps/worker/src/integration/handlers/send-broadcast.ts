import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { broadcastModel } from "@chatbotx.io/database/schema"
import {
  BROADCAST_PAYLOAD_TYPE,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"

export const sendBroadcast = async (broadcastId: string) => {
  async function updateBroadcastStatus(
    broadcastId: string,
    status: "sent" | "scheduled",
  ) {
    return await db
      .update(broadcastModel)
      .set({
        status,
      })
      .where(eq(broadcastModel.id, broadcastId))
  }

  const broadcast = await findOrFail({
    table: broadcastModel,
    where: {
      id: broadcastId,
      status: "scheduled",
    },
    message: "Broadcast not found",
  })

  const contactsOnBroadcasts =
    await db.query.contactsOnBroadcastsModel.findMany({
      where: {
        broadcastId,
      },
      with: {
        conversation: true,
        contactInbox: true,
      },
    })
  if (contactsOnBroadcasts.length === 0) {
    await updateBroadcastStatus(broadcastId, "sent")
    return
  }

  try {
    await Promise.allSettled(
      contactsOnBroadcasts.map(async (contactOnBroadcast) => {
        if (broadcast.flowId) {
          await integrationQueue.add(IntegrationJobAction.sendFlow, {
            type: IntegrationJobAction.sendFlow,
            data: {
              flowId: broadcast.flowId,
              conversationId: contactOnBroadcast.conversationId,
              metadata: {
                type: BROADCAST_PAYLOAD_TYPE,
                broadcastId: broadcast.id,
                contactInboxId: contactOnBroadcast.contactInboxId,
              },
            },
          })
        }

        if (broadcast.templateId) {
          await chatQueue.add(ChatJobAction.sendWhatsappTemplateMessage, {
            type: ChatJobAction.sendWhatsappTemplateMessage,
            data: {
              conversation: contactOnBroadcast.conversation,
              contactInbox: contactOnBroadcast.contactInbox,
              templateId: broadcast.templateId,
              broadcastId: broadcast.id,
              templateData: broadcast.templateData as
                | WaTemplateParams
                | undefined,
              metadata: {
                type: BROADCAST_PAYLOAD_TYPE,
                broadcastId: broadcast.id,
                contactInboxId: contactOnBroadcast.contactInboxId,
              },
            },
          })
        }
      }),
    )

    await updateBroadcastStatus(broadcastId, "sent")
  } catch (error) {
    console.error("Error sending broadcast", error)

    await updateBroadcastStatus(broadcastId, "scheduled")
  }
}
