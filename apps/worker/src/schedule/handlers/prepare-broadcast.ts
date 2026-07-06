import { inboxService } from "@chatbotx.io/business"
import { and, asc, db, eq, gt, inArray } from "@chatbotx.io/database/client"
import {
  type BroadcastStatus,
  broadcastStatuses,
  channelTypes,
} from "@chatbotx.io/database/partials"
import {
  buildContactInboxContactFilterSQL,
  type ContactFilterCriteriaInput,
} from "@chatbotx.io/database/queries"
import {
  broadcastModel,
  contactInboxModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import { chunkById } from "@chatbotx.io/database/utils"
import {
  broadcastSendJobId,
  ScheduleJobData,
  scheduleQueue,
} from "@chatbotx.io/worker-config"

export const prepareBroadcast = async (broadcastId: string) => {
  const broadcast = await db.query.broadcastModel.findFirst({
    where: {
      id: broadcastId,
      status: "scheduled",
    },
  })

  if (!broadcast) {
    console.error("Broadcast not found or not scheduled", broadcastId)
    return
  }

  const parsedChannel = channelTypes.safeParse(broadcast.channel)
  const inboxIds = await inboxService.resolveBroadcastInboxIds({
    workspaceId: broadcast.workspaceId,
    channels: parsedChannel.success ? [parsedChannel.data] : [],
    integrationWhatsappId: broadcast.integrationWhatsappId,
  })

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
            broadcast.contactFilter
              ? buildContactInboxContactFilterSQL({
                  contactIdColumn: contactInboxModel.contactId,
                  workspaceId: broadcast.workspaceId,
                  contactFilter:
                    broadcast.contactFilter as ContactFilterCriteriaInput,
                })
              : undefined,
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

  await scheduleQueue.add(
    ScheduleJobData.sendBroadcast,
    {
      type: ScheduleJobData.sendBroadcast,
      data: {
        broadcastId,
      },
    },
    {
      jobId: broadcastSendJobId(broadcastId),
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
}
