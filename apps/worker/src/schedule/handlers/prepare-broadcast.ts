import { broadcastService, conversationService } from "@chatbotx.io/business"
import {
  type BroadcastStatus,
  broadcastStatuses,
  broadcastSubactions,
  channelTypes,
  resolveBroadcastAudienceRange,
  resolveBroadcastTargetInboxIds,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"
import {
  broadcastSendJobId,
  ScheduleJobData,
  scheduleQueue,
} from "@chatbotx.io/worker-config"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { logger } from "../../lib/logger"

export const prepareBroadcast = async (broadcastId: string) => {
  const broadcast = await broadcastService.findScheduledForPrepare({
    broadcastId,
  })

  if (!broadcast) {
    logger.warn({ broadcastId }, "Broadcast not found or not scheduled")
    return
  }

  if (await isBlockedWorkspace(broadcast.workspaceId)) {
    return
  }

  // The dispatch epoch read at the start of this run. `moveToDraft` bumps
  // `resumeCount`, so pinning the promotion UPDATE below to this value
  // defeats a stale prepare (running behind a moveToDraft → re-schedule
  // round-trip) from wrongly promoting the NEW schedule's row.
  const promotionEpoch = broadcast.resumeCount

  // A retry of a run that failed midway keeps the rows it already wrote (same
  // audience), so they start the count; normally there are none and this
  // returns at once. Each chunk then adds the rows it actually wrote.
  let contactCount = await broadcastService.countRecipients({ broadcastId })

  // Rows a stale run wrote belong to a schedule nobody will send: queue their
  // cleanup (the draft cannot be scheduled again until they are gone).
  const queueStaleRecipientsPurge = () =>
    broadcastService.queueDraftRecipientsPurge({
      workspaceId: broadcast.workspaceId,
      broadcastId,
      requester: "stalePrepare",
    })

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
    integrationMessengerId =
      await broadcastService.resolveTemplateIntegrationMessengerId({
        workspaceId: broadcast.workspaceId,
        templateId: broadcast.templateId,
      })
  }

  await broadcastService.forEachAudienceChunk(
    {
      workspaceId: broadcast.workspaceId,
      channels: parsedChannel.success ? [parsedChannel.data] : [],
      // Targets mode scopes by the target pages (an empty list once every
      // page is gone means nobody); channel mode leaves it undefined so the
      // legacy integration columns / channel apply.
      inboxIds: resolveBroadcastTargetInboxIds(broadcast),
      integrationWhatsappId: broadcast.integrationWhatsappId,
      integrationMessengerId,
      contactFilter:
        broadcast.contactFilter as ContactFilterCriteriaInput | null,
      subaction: parsedSubaction.success ? parsedSubaction.data : undefined,
      audienceRange: resolveBroadcastAudienceRange(broadcast),
    },
    async (contactInboxes): Promise<boolean | undefined> => {
      // A contact with no DM yet (it only commented, or was imported) is part
      // of the audience the form counted, so it gets its DM here rather than
      // being dropped before the send.
      const conversations =
        await conversationService.findOrCreateDMByContactIds({
          workspaceId: broadcast.workspaceId,
          contactIds: contactInboxes.map(
            (contactInbox) => contactInbox.contactId,
          ),
        })

      const conversationMap = new Map(
        conversations.map((conversation) => [
          conversation.contactId,
          conversation,
        ]),
      )

      const recipients = contactInboxes.flatMap((contactInbox) => {
        const conversation = conversationMap.get(contactInbox.contactId)
        return conversation
          ? [
              {
                broadcastId,
                contactId: contactInbox.contactId,
                contactInboxId: contactInbox.id,
                conversationId: conversation.id,
              },
            ]
          : []
      })

      if (recipients.length > 0) {
        contactCount += await broadcastService.insertRecipients({ recipients })
      }

      // Checked after writing: `moveToDraft` bumps the epoch mid-run, and a
      // chunk written after it looked for leftovers would be left behind. So
      // queue their cleanup, and stop writing an audience nobody will send.
      if (
        await broadcastService.isStillPreparing({
          broadcastId,
          resumeCount: promotionEpoch,
        })
      ) {
        return
      }
      await queueStaleRecipientsPurge()
      return false
    },
  )

  const broadcastStatus: BroadcastStatus =
    contactCount > 0
      ? broadcastStatuses.enum.sending
      : broadcastStatuses.enum.sent

  const promoted = await broadcastService.promoteAfterPrepare({
    broadcastId,
    status: broadcastStatus,
    contactCount,
    promotionEpoch,
  })

  if (!promoted) {
    // Lost the promotion race — a moveToDraft (or delete) bumped the epoch
    // or moved the row off `scheduled` after the walk's last check.
    if (contactCount > 0) {
      await queueStaleRecipientsPurge()
    }
    logger.warn(
      { broadcastId, promotionEpoch },
      "prepareBroadcast: lost the promotion race, skipping sendBroadcast enqueue",
    )
    return
  }

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
