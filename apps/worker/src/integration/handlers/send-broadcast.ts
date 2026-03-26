import { and, db, eq, findOrFail, inArray } from "@aha.chat/database/client"
import { broadcastModel, conversationModel } from "@aha.chat/database/schema"
import type { WaTemplateParams } from "@aha.chat/flow-config"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@aha.chat/worker-config"

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

  const broadcast = await findOrFail(
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

  let validInboxIds: string[] | undefined
  if (broadcast.templateId) {
    const template = await db.query.whatsappMessageTemplateModel.findFirst({
      where: { id: broadcast.templateId },
      columns: {
        integrationWhatsappId: true,
      },
    })

    if (template?.integrationWhatsappId) {
      const integration = await db.query.integrationWhatsappModel.findFirst({
        where: { id: template.integrationWhatsappId },
        columns: {
          inboxId: true,
        },
      })

      validInboxIds = integration?.inboxId ? [integration.inboxId] : undefined
    } else {
      await updateBroadcastStatus(broadcastId, "sent")
      return
    }
  }

  const whereConditions = [
    inArray(
      conversationModel.contactId,
      contactsOnBroadcasts.map((cb) => cb.contactId),
    ),
  ]

  if (validInboxIds && validInboxIds.length > 0) {
    whereConditions.push(inArray(conversationModel.inboxId, validInboxIds))
  }

  const conversations = await db
    .select({ id: conversationModel.id })
    .from(conversationModel)
    .where(and(...whereConditions))

  try {
    await Promise.allSettled(
      conversations.map(async (cvst) => {
        if (broadcast.flowId) {
          await integrationQueue.add(IntegrationJobAction.sendFlow, {
            type: IntegrationJobAction.sendFlow,
            data: {
              flowId: broadcast.flowId,
              conversationId: cvst.id,
            },
          })
        }

        if (broadcast.templateId) {
          await chatQueue.add(ChatJobAction.sendWhatsappTemplateMessage, {
            type: ChatJobAction.sendWhatsappTemplateMessage,
            data: {
              conversationId: cvst.id,
              templateId: broadcast.templateId,
              broadcastId: broadcast.id,
              templateData: broadcast.templateData as
                | WaTemplateParams
                | undefined,
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
