import { broadcastService } from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import {
  type BroadcastStatus,
  broadcastStatuses,
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
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
  const parsedSubaction = broadcastSubactions.safeParse(broadcast.subaction)
  let integrationMessengerId: string | null = null

  if (
    parsedSubaction.success &&
    parsedSubaction.data ===
      broadcastSubactions.enum.messengerTemplateMessage &&
    broadcast.templateId
  ) {
    const template = await db.query.messengerMessageTemplateModel.findFirst({
      where: {
        id: broadcast.templateId,
        integrationMessenger: { workspaceId: broadcast.workspaceId },
      },
      columns: { integrationMessengerId: true },
    })
    integrationMessengerId = template?.integrationMessengerId ?? null
  }

  let hasContactOnBroadcast = false
  let contactCount = 0

  await broadcastService.forEachAudienceChunk(
    {
      workspaceId: broadcast.workspaceId,
      channels: parsedChannel.success ? [parsedChannel.data] : [],
      integrationWhatsappId: broadcast.integrationWhatsappId,
      integrationMessengerId,
      contactFilter:
        broadcast.contactFilter as ContactFilterCriteriaInput | null,
      subaction: parsedSubaction.success ? parsedSubaction.data : undefined,
    },
    async (contactInboxes): Promise<boolean | undefined> => {
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
