import { and, db, eq, sql } from "@chatbotx.io/database/client"
import { broadcastStatuses, channelTypes } from "@chatbotx.io/database/partials"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import {
  BROADCAST_PAYLOAD_TYPE,
  type MessengerTemplateParams,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { logger } from "../../lib/logger"

const DEFAULT_BROADCAST_RATE_LIMIT = 500
const BROADCAST_SEND_JOB_RETENTION_SECONDS = 3600

type BroadcastForSend = Awaited<
  ReturnType<(typeof db.query.broadcastModel)["findMany"]>
>[number]

type ContactOnBroadcastForSend = Awaited<
  ReturnType<(typeof db.query.contactsOnBroadcastsModel)["findMany"]>
>[number] & {
  conversation?: ConversationModel | null
  contactInbox?: ContactInboxModel | null
}

const downstreamJobOptions = (jobId: string) => ({
  jobId,
  removeOnComplete: {
    age: BROADCAST_SEND_JOB_RETENTION_SECONDS,
    count: 100_000,
  },
})

const broadcastContactSendJobId = (
  broadcastId: string,
  contactId: string,
  type: "flow" | "template",
) => `broadcast-send-contact-${broadcastId}-${contactId}-${type}`

const invalidBroadcastContact = (
  contactOnBroadcast: ContactOnBroadcastForSend,
  broadcast: BroadcastForSend,
): string | null => {
  if (broadcast.flowId && !contactOnBroadcast.conversationId) {
    return "missing conversation for flow send"
  }

  if (
    broadcast.templateId &&
    !(contactOnBroadcast.conversation && contactOnBroadcast.contactInbox)
  ) {
    return "missing conversation/contactInbox for template send"
  }

  return null
}

const markContactFailed = async (
  contactOnBroadcast: ContactOnBroadcastForSend,
  reason: string,
) => {
  await db
    .update(contactsOnBroadcastsModel)
    .set({
      failedAt: sql`CURRENT_TIMESTAMP`,
      errorContent: reason,
    })
    .where(
      and(
        eq(
          contactsOnBroadcastsModel.broadcastId,
          contactOnBroadcast.broadcastId,
        ),
        eq(contactsOnBroadcastsModel.contactId, contactOnBroadcast.contactId),
      ),
    )
}

const markContactSent = async (
  contactOnBroadcast: ContactOnBroadcastForSend,
) => {
  await db
    .update(contactsOnBroadcastsModel)
    .set({ sent: true })
    .where(
      and(
        eq(
          contactsOnBroadcastsModel.broadcastId,
          contactOnBroadcast.broadcastId,
        ),
        eq(contactsOnBroadcastsModel.contactId, contactOnBroadcast.contactId),
      ),
    )
}

const enqueueBroadcastContact = async (
  broadcast: BroadcastForSend,
  contactOnBroadcast: ContactOnBroadcastForSend,
) => {
  if (broadcast.flowId) {
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          flowId: broadcast.flowId,
          conversationId: contactOnBroadcast.conversationId,
          contactInboxId: contactOnBroadcast.contactInboxId,
          metadata: {
            type: BROADCAST_PAYLOAD_TYPE,
            broadcastId: broadcast.id,
            contactInboxId: contactOnBroadcast.contactInboxId,
          },
        },
      },
      downstreamJobOptions(
        broadcastContactSendJobId(
          broadcast.id,
          contactOnBroadcast.contactId,
          "flow",
        ),
      ),
    )
  }

  if (!broadcast.templateId) {
    return
  }

  if (broadcast.channel === channelTypes.enum.messenger) {
    // create-broadcast.action stores { ...templateParams, buttons: [...] } in templateData.
    // Separate buttons so the job type receives the correct shape.
    type RawMessengerData = MessengerTemplateParams & {
      buttons?: Array<{ id: string; label: string; flowId?: string }>
    }
    const rawMessengerData = broadcast.templateData as
      | RawMessengerData
      | undefined
    const { buttons: broadcastButtons, ...cleanMessengerParams } =
      rawMessengerData ?? ({} as RawMessengerData)

    await chatQueue.add(
      ChatJobAction.sendMessengerTemplateMessage,
      {
        type: ChatJobAction.sendMessengerTemplateMessage,
        data: {
          conversation: contactOnBroadcast.conversation as ConversationModel,
          contactInbox: contactOnBroadcast.contactInbox as ContactInboxModel,
          templateId: broadcast.templateId,
          broadcastId: broadcast.id,
          templateData:
            Object.keys(cleanMessengerParams).length > 0
              ? (cleanMessengerParams as MessengerTemplateParams)
              : undefined,
          buttons: broadcastButtons,
          metadata: {
            type: BROADCAST_PAYLOAD_TYPE,
            broadcastId: broadcast.id,
            contactInboxId: contactOnBroadcast.contactInboxId,
          },
        },
      },
      downstreamJobOptions(
        broadcastContactSendJobId(
          broadcast.id,
          contactOnBroadcast.contactId,
          "template",
        ),
      ),
    )
    return
  }

  await chatQueue.add(
    ChatJobAction.sendWhatsappTemplateMessage,
    {
      type: ChatJobAction.sendWhatsappTemplateMessage,
      data: {
        conversation: contactOnBroadcast.conversation as ConversationModel,
        contactInbox: contactOnBroadcast.contactInbox as ContactInboxModel,
        templateId: broadcast.templateId,
        broadcastId: broadcast.id,
        templateData: broadcast.templateData as WaTemplateParams | undefined,
        metadata: {
          type: BROADCAST_PAYLOAD_TYPE,
          broadcastId: broadcast.id,
          contactInboxId: contactOnBroadcast.contactInboxId,
        },
      },
    },
    downstreamJobOptions(
      broadcastContactSendJobId(
        broadcast.id,
        contactOnBroadcast.contactId,
        "template",
      ),
    ),
  )
}

export const processBroadcastContacts = async (broadcastId: string) => {
  const broadcasts = await db.query.broadcastModel.findMany({
    where: {
      id: broadcastId,
      status: broadcastStatuses.enum.sending,
    },
  })

  if (broadcasts.length === 0) {
    return { processed: 0 }
  }

  if (await isBlockedWorkspace(broadcasts[0].workspaceId)) {
    return { processed: 0 }
  }

  let totalProcessed = 0

  for (const broadcast of broadcasts) {
    const contactsOnBroadcasts =
      await db.query.contactsOnBroadcastsModel.findMany({
        where: {
          broadcastId: broadcast.id,
          sent: false,
          failedAt: { isNull: true },
        },
        with: {
          conversation: true,
          contactInbox: true,
        },
        limit: DEFAULT_BROADCAST_RATE_LIMIT,
      })

    if (contactsOnBroadcasts.length === 0) {
      await db
        .update(broadcastModel)
        .set({ status: broadcastStatuses.enum.sent })
        .where(eq(broadcastModel.id, broadcast.id))
      continue
    }

    let retryableFailure: unknown = null

    await Promise.all(
      contactsOnBroadcasts.map(async (contactOnBroadcast) => {
        try {
          const invalidReason = invalidBroadcastContact(
            contactOnBroadcast,
            broadcast,
          )

          if (invalidReason) {
            await markContactFailed(contactOnBroadcast, invalidReason)
            return
          }

          await enqueueBroadcastContact(broadcast, contactOnBroadcast)
          await markContactSent(contactOnBroadcast)

          totalProcessed++
        } catch (error) {
          retryableFailure ??= error
          logger.error(
            { err: error, contactOnBroadcast },
            "Retryable error sending broadcast contact",
          )
        }
      }),
    )

    if (retryableFailure) {
      throw retryableFailure
    }

    const fetchedFull =
      contactsOnBroadcasts.length === DEFAULT_BROADCAST_RATE_LIMIT

    // More rows remain; reconcileBroadcasts cron drives the next batch.
    // Keep a single driver so kick + cron share one jobId and cannot multiply.
    if (fetchedFull) {
      continue
    }

    await db
      .update(broadcastModel)
      .set({ status: broadcastStatuses.enum.sent })
      .where(eq(broadcastModel.id, broadcast.id))
  }

  return { processed: totalProcessed }
}
