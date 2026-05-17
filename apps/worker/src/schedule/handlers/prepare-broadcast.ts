import { and, asc, db, eq, gt, inArray } from "@chatbotx.io/database/client"
import {
  type BroadcastStatus,
  broadcastStatuses,
  channelTypes,
} from "@chatbotx.io/database/partials"
import {
  broadcastModel,
  contactInboxModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import { chunkById } from "@chatbotx.io/database/utils"
import { ScheduleJobData, scheduleQueue } from "@chatbotx.io/worker-config"

export const prepareBroadcast = async (broadcastId: string) => {
  const broadcast = await db.query.broadcastModel.findFirst({
    where: {
      id: broadcastId,
      status: "scheduled",
    },
    with: {
      integrationWhatsapp: true,
    },
  })

  if (!broadcast) {
    console.error("Broadcast not found or not scheduled", broadcastId)
    return
  }

  // Get inboxIds based on integrationWhatsappId or channel
  let inboxIds: string[] = []
  if (broadcast.integrationWhatsappId && broadcast.integrationWhatsapp) {
    inboxIds = [broadcast.integrationWhatsapp.inboxId]
  } else {
    const inboxes = await db.query.inboxModel.findMany({
      where: {
        workspaceId: broadcast.workspaceId,
        ...(broadcast.channel &&
          broadcast.channel !== channelTypes.enum.omnichannel && {
            channel: broadcast.channel,
          }),
      },
    })
    if (inboxes.length > 0) {
      inboxIds = inboxes.map((inbox) => inbox.id)
    }
  }

  if (inboxIds.length === 0) {
    await db
      .update(broadcastModel)
      .set({ status: "sent" })
      .where(eq(broadcastModel.id, broadcastId))
    return
  }

  let hasContactOnBroadcast = false
  let contactCount = 0

  await chunkById(
    async (lastId) =>
      await db
        .select()
        .from(contactInboxModel)
        .where(
          and(
            inArray(contactInboxModel.inboxId, inboxIds),
            lastId ? gt(contactInboxModel.id, lastId) : undefined,
          ),
        )
        .orderBy(asc(contactInboxModel.id))
        .limit(1000),
    {
      chunkSize: 1000,
      callback: async (contactInboxes): Promise<boolean | undefined> => {
        hasContactOnBroadcast = true

        const conversations = await db.query.conversationModel.findMany({
          where: {
            contactId: {
              in: Array.from(
                new Set(
                  contactInboxes.map((contactInbox) => contactInbox.contactId),
                ),
              ),
            },
            workspaceId: broadcast.workspaceId,
          },
        })

        const conversationMap = new Map(
          conversations.map((conversation) => [
            conversation.contactId,
            conversation,
          ]),
        )

        await db
          .insert(contactsOnBroadcastsModel)
          .values(
            contactInboxes.map((contactInbox) => ({
              broadcastId,
              contactId: contactInbox.contactId,
              contactInboxId: contactInbox.id,
              conversationId:
                conversationMap.get(contactInbox.contactId)?.id || "",
            })),
          )
          .onConflictDoNothing()

        contactCount += contactInboxes.length

        return
      },
    },
  )

  const broadcastStatus: BroadcastStatus = hasContactOnBroadcast
    ? broadcastStatuses.enum.sending
    : broadcastStatuses.enum.sent

  await db
    .update(broadcastModel)
    .set({ status: broadcastStatus, contactCount })
    .where(eq(broadcastModel.id, broadcastId))

  if (broadcastStatus === broadcastStatuses.enum.sent) {
    return
  }

  await scheduleQueue.add(ScheduleJobData.sendBroadcast, {
    type: ScheduleJobData.sendBroadcast,
    data: {
      broadcastId,
    },
  })
}
