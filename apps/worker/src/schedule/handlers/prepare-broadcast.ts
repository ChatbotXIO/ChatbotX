import { broadcastService, conversationService } from "@chatbotx.io/business"
import { and, db, eq, isNull } from "@chatbotx.io/database/client"
import {
  type BroadcastStatus,
  broadcastStatuses,
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"
import { purgeBroadcastRecipients } from "@chatbotx.io/database/repositories"
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

// Purge tuning for the stale-recipient cleanup at the start of a prepare run.
// Normally 0 rows (nothing to clean up), so a generous budget is cheap.
const PREPARE_PURGE_CHUNK_SIZE = 1000
const PREPARE_PURGE_INTER_CHUNK_DELAY_MS = 50
const PREPARE_PURGE_MAX_RUN_DURATION_MS = 60_000

export const prepareBroadcast = async (broadcastId: string) => {
  const broadcast = await db.query.broadcastModel.findFirst({
    where: {
      id: broadcastId,
      status: "scheduled",
      deletedAt: { isNull: true },
    },
  })

  if (!broadcast) {
    logger.warn({ broadcastId }, "Broadcast not found or not scheduled")
    return
  }

  if (await isBlockedWorkspace(broadcast.workspaceId)) {
    return
  }

  // A prior prepare run may have left stale `ContactOnBroadcast` rows behind
  // (e.g. a moveToDraft → re-schedule race). Clearing them before rebuilding
  // the audience stops a later re-schedule from leaking old recipients.
  // Normally a no-op — 0 rows removed.
  await purgeBroadcastRecipients({
    broadcastId,
    chunkSize: PREPARE_PURGE_CHUNK_SIZE,
    interChunkDelayMs: PREPARE_PURGE_INTER_CHUNK_DELAY_MS,
    maxRunDurationMs: PREPARE_PURGE_MAX_RUN_DURATION_MS,
  })

  // The dispatch epoch read at the start of this run. `moveToDraft` bumps
  // `resumeCount`, so pinning the promotion UPDATE below to this value
  // defeats a stale prepare (running behind a moveToDraft → re-schedule
  // round-trip) from wrongly promoting the NEW schedule's row.
  const promotionEpoch = broadcast.resumeCount

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

  const [promoted] = await db
    .update(broadcastModel)
    .set({ status: broadcastStatus, contactCount })
    .where(
      and(
        eq(broadcastModel.id, broadcastId),
        eq(broadcastModel.status, broadcastStatuses.enum.scheduled),
        isNull(broadcastModel.deletedAt),
        eq(broadcastModel.resumeCount, promotionEpoch),
      ),
    )
    .returning({ id: broadcastModel.id })

  if (!promoted) {
    // Lost the promotion race — a moveToDraft (or delete) bumped the epoch
    // or moved the row off `scheduled` since this run started. The audience
    // rows this run just inserted belong to a stale schedule; the next
    // prepare (or the cleanup at the top of this function) removes them.
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
