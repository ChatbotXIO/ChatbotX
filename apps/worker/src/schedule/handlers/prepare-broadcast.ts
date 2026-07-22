import { broadcastService, conversationService } from "@chatbotx.io/business"
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
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { logger } from "../../lib/logger"

export const prepareBroadcast = async (broadcastId: string) => {
  const broadcast = await db.query.broadcastModel.findFirst({
    where: {
      id: broadcastId,
      status: "scheduled",
    },
  })

  if (!broadcast) {
    logger.warn({ broadcastId }, "Broadcast not found or not scheduled")
    return
  }

  if (await isBlockedWorkspace(broadcast.workspaceId)) {
    return
  }

  const parsedChannel = channelTypes.safeParse(broadcast.channel)
  const parsedSubaction = broadcastSubactions.safeParse(broadcast.subaction)
  // The audience must stay scoped to the page the broadcast was created for;
  // rows created before the column existed fall back to the template's
  // integration.
  let integrationMessengerId: string | null =
    broadcast.integrationMessengerId ?? null

  if (
    !integrationMessengerId &&
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
      const conversations = await conversationService.findDMByContactIds({
        workspaceId: broadcast.workspaceId,
        contactIds: contactInboxes.map(
          (contactInbox) => contactInbox.contactId,
        ),
        // TikTok resolves its DM by a non-null sourceId; every other channel
        // keeps the sourceId IS NULL convention.
        channel: parsedChannel.success ? parsedChannel.data : undefined,
      })

      const conversationMap = new Map(
        conversations.map((conversation) => [
          conversation.contactId,
          conversation,
        ]),
      )

      const recipients = contactInboxes.flatMap((contactInbox) => {
        const conversation = conversationMap.get(contactInbox.contactId)
        if (!conversation) {
          return []
        }

        return [
          {
            broadcastId,
            contactId: contactInbox.contactId,
            contactInboxId: contactInbox.id,
            conversationId: conversation.id,
          },
        ]
      })
      const skippedCount = contactInboxes.length - recipients.length

      if (skippedCount > 0) {
        logger.info(
          { broadcastId, skippedCount },
          "Skipped broadcast contacts without a DM conversation",
        )
      }

      if (recipients.length === 0) {
        return
      }

      hasContactOnBroadcast = true

      await db
        .insert(contactsOnBroadcastsModel)
        .values(recipients)
        .onConflictDoNothing()

      contactCount += recipients.length

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
