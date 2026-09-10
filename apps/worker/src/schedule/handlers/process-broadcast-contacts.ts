import { broadcastService } from "@chatbotx.io/business"
import { and, db, eq, sql } from "@chatbotx.io/database/client"
import {
  broadcastSendsFlow,
  broadcastSendsTemplate,
  broadcastStatuses,
  channelTypes,
  hasBroadcastSendForInbox,
  resolveBroadcastFlowSend,
  resolveBroadcastTemplateSend,
  usesBroadcastTargets,
} from "@chatbotx.io/database/partials"
import { contactsOnBroadcastsModel } from "@chatbotx.io/database/schema"
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
>[number] & {
  targets: {
    inboxId: string
    flowId: string | null
    templateId: string | null
    templateData: unknown
  }[]
}

/** The reasons a recipient cannot be enqueued; stored as the row's `errorContent`. */
const NO_TEMPLATE_FOR_PAGE_REASON =
  "no template selected for the contact's page"
const NO_FLOW_FOR_PAGE_REASON = "no flow selected for the contact's page"
const NO_SEND_FOR_PAGE_REASON =
  "no flow or template selected for the contact's page"

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

// Suffixed with the broadcast's dispatch epoch (`resumeCount`) so a resumed
// run's jobIds never collide with a completed job from the pre-stop epoch
// still sitting in the queue's 1-hour removeOnComplete retention window —
// see `resumeSending` in broadcast/service.ts.
const broadcastContactSendJobId = (
  broadcastId: string,
  contactId: string,
  type: "flow" | "template",
  resumeCount: number,
) =>
  `broadcast-send-contact-${broadcastId}-${contactId}-${type}-r${resumeCount}`

/** One reason a recipient cannot be handed to its send job, checked in order. */
type RecipientRule = {
  violated: (
    contactOnBroadcast: ContactOnBroadcastForSend,
    broadcast: BroadcastForSend,
  ) => boolean
  reason: string
}

const inboxIdOf = (contactOnBroadcast: ContactOnBroadcastForSend) =>
  contactOnBroadcast.contactInbox?.inboxId

// A multi-page broadcast delivers each page with its own flow or template; a
// page that ended up without one (a deleted flow, a contact outside every
// target) is a per-recipient failure, never a reason to stall the broadcast.
const recipientRules: readonly RecipientRule[] = [
  {
    violated: (contact, broadcast) =>
      broadcastSendsFlow(broadcast) && !contact.conversationId,
    reason: "missing conversation for flow send",
  },
  {
    violated: (contact, broadcast) => {
      const inboxId = inboxIdOf(contact)
      return (
        broadcastSendsFlow(broadcast) &&
        !(inboxId && resolveBroadcastFlowSend(broadcast, inboxId))
      )
    },
    reason: NO_FLOW_FOR_PAGE_REASON,
  },
  {
    violated: (contact, broadcast) =>
      broadcastSendsTemplate(broadcast) &&
      !(contact.conversation && contact.contactInbox),
    reason: "missing conversation/contactInbox for template send",
  },
  {
    violated: (contact, broadcast) => {
      const inboxId = inboxIdOf(contact)
      return (
        broadcastSendsTemplate(broadcast) &&
        !(inboxId && resolveBroadcastTemplateSend(broadcast, inboxId))
      )
    },
    reason: NO_TEMPLATE_FOR_PAGE_REASON,
  },
  // Last: nothing left to send for this page at all (every flow deleted,
  // no template) — the specific reasons above did not apply.
  {
    violated: (contact, broadcast) => {
      const inboxId = inboxIdOf(contact)
      return (
        usesBroadcastTargets(broadcast) &&
        !(inboxId && hasBroadcastSendForInbox(broadcast, inboxId))
      )
    },
    reason: NO_SEND_FOR_PAGE_REASON,
  },
]

const invalidBroadcastContact = (
  contactOnBroadcast: ContactOnBroadcastForSend,
  broadcast: BroadcastForSend,
): string | null =>
  recipientRules.find((rule) => rule.violated(contactOnBroadcast, broadcast))
    ?.reason ?? null

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

const enqueueBroadcastContact = async (
  broadcast: BroadcastForSend,
  contactOnBroadcast: ContactOnBroadcastForSend,
) => {
  const contactInbox = contactOnBroadcast.contactInbox as ContactInboxModel
  const flowId = broadcastSendsFlow(broadcast)
    ? resolveBroadcastFlowSend(broadcast, contactInbox.inboxId)
    : null
  if (flowId) {
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          flowId,
          conversationId: contactOnBroadcast.conversationId,
          contactInboxId: contactOnBroadcast.contactInboxId,
          // The flow stop/resume guard's ONE authoritative "initial
          // broadcast dispatch" marker (see the field's doc comment in
          // worker-config). Every re-dispatch downstream of this one must
          // leave it unset.
          initialBroadcastDispatch: true,
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
          broadcast.resumeCount,
        ),
      ),
    )
  }

  const templateSend = broadcastSendsTemplate(broadcast)
    ? resolveBroadcastTemplateSend(broadcast, contactInbox.inboxId)
    : null
  if (!templateSend) {
    return
  }

  if (broadcast.channel === channelTypes.enum.messenger) {
    // create-broadcast.action stores { ...templateParams, buttons: [...] } in templateData.
    // Separate buttons so the job type receives the correct shape.
    type RawMessengerData = MessengerTemplateParams & {
      buttons?: Array<{ id: string; label: string; flowId?: string }>
    }
    const rawMessengerData = templateSend.templateData as
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
          contactInbox,
          templateId: templateSend.templateId,
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
          broadcast.resumeCount,
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
        contactInbox,
        templateId: templateSend.templateId,
        broadcastId: broadcast.id,
        templateData: templateSend.templateData as WaTemplateParams | undefined,
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
        broadcast.resumeCount,
      ),
    ),
  )
}

export const processBroadcastContacts = async (broadcastId: string) => {
  const broadcasts = await db.query.broadcastModel.findMany({
    where: {
      id: broadcastId,
      status: broadcastStatuses.enum.sending,
      deletedAt: { isNull: true },
    },
    with: {
      targets: {
        columns: {
          inboxId: true,
          flowId: true,
          templateId: true,
          templateData: true,
        },
      },
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
      // Everything has been handed to the channel; finalizeBroadcasts resolves sent|failed.
      await broadcastService.markHandoffCompleted({ broadcastId: broadcast.id })
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
          // Conditioned on the broadcast still being `sending` (I1 lost-update
          // fix): a stale in-flight job from a stopped/resumed run cannot
          // resurrect a row that resume/cleanup has since reset or purged.
          await broadcastService.markContactSentIfSending({
            broadcastId: broadcast.id,
            contactId: contactOnBroadcast.contactId,
          })

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

    await broadcastService.markHandoffCompleted({ broadcastId: broadcast.id })
  }

  return { processed: totalProcessed }
}
