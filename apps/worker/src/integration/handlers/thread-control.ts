import {
  buildContext,
  conversationService,
  threadControlService,
} from "@chatbotx.io/business"
import {
  requestThreadControlAction,
  syncThreadOwner,
} from "@chatbotx.io/channel-registry/thread-control"
import {
  contactSources,
  type IntegrationType,
} from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
  InboxModel,
} from "@chatbotx.io/database/types"
import {
  SdkException,
  type ThreadControlWebhookEvent,
  type ThreadControlWebhookResult,
} from "@chatbotx.io/sdk"
import type {
  IntegrationJobThreadControlAction,
  IntegrationJobThreadControlEvent,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  allIntegrations,
  type IntegrationRow,
  integrationService,
} from "../../services/integrations"
import {
  enqueueAiHandoverTakeBackIfDue,
  isPermanentThreadControlFailure,
} from "./ai-handover-take-back"
import { startHandoverResponse } from "./handover-response"
import {
  detectContactAndConversation,
  receiveMessage,
  resolveExistingContactInbox,
} from "./received-message"
import { recordWhatsappCallPermissionReply } from "./whatsapp-call-permission-reply"

type ThreadControlEventData = IntegrationJobThreadControlEvent["data"]

/** How BullMQ is running this job. */
export type ThreadControlEventJobOptions = {
  /**
   * True when BullMQ is REPROCESSING this job rather than delivering it fresh.
   * A handover whose event already landed (it failed after `recordEvent` — the
   * resume-flow enqueue threw, OR the worker process was killed mid-job) reads
   * as a redelivery, but a reprocess must still start the flow; the flow's
   * deterministic job id keeps that exactly-once. Covers BOTH a thrown-error
   * retry and a stalled-job recovery after a crash — see
   * `isThreadControlJobReprocess`.
   */
  isRetry: boolean
  /** The routing job's id, deterministic per webhook event. */
  jobId?: string
}

/**
 * Whether BullMQ is reprocessing a job it already started once. A thrown-error
 * retry increments `attemptsMade`; a worker crash (the process dies mid-job) is
 * recovered by the stalled-job checker, which increments `stalledCounter` but
 * NOT `attemptsMade` (verified in the installed BullMQ). Both mean the previous
 * attempt may have recorded the handover without enqueueing the resume flow, so
 * both must be allowed to (re)start it; checking only `attemptsMade` would drop
 * the resume on every crash.
 */
export const isThreadControlJobReprocess = (job: {
  attemptsMade: number
  stalledCounter: number
}): boolean => job.attemptsMade > 0 || job.stalledCounter > 0

type HandoverContext = {
  data: ThreadControlEventData
  inbox: InboxModel
  integrationRow: IntegrationRow
  event: ThreadControlWebhookEvent
  job: ThreadControlEventJobOptions
}

type ResolvedThread = {
  contactInbox: ContactInboxModel
  conversation: ConversationModel
}

/**
 * What a handover for a contact we have never seen does. We must answer a
 * conversation handed to us, so the contact is created; a `control_taken` for
 * an unknown contact has nothing to attach to and is dropped.
 */
const UNKNOWN_CONTACT_POLICY: Record<
  ThreadControlWebhookEvent["event"],
  "create" | "drop"
> = {
  controlPassed: "create",
  controlTaken: "drop",
}

const resolveHandoverThread = async (
  context: HandoverContext,
): Promise<ResolvedThread | null> => {
  const { inbox, integrationRow, event } = context
  const existing = await resolveExistingContactInbox({
    inbox,
    incomingContact: event.contact,
  })
  if (existing) {
    const conversation = await conversationService.findOrCreate({
      workspaceId: inbox.workspaceId,
      contactId: existing.row.contactId,
      sourceId: null,
    })
    return { contactInbox: existing.row, conversation }
  }

  if (UNKNOWN_CONTACT_POLICY[event.event] === "drop") {
    logger.debug(
      { inboxId: inbox.id, event: event.event },
      "Dropping a thread-control handover for an unknown contact",
    )
    return null
  }

  const detected = await detectContactAndConversation({
    incomingContact: event.contact,
    inbox,
    integrationRow,
    source: contactSources.enum.inboundMessage,
  })
  return {
    contactInbox: detected.contactInbox,
    conversation: detected.conversation,
  }
}

const readHandoverResumeFlowId = (
  integrationRow: IntegrationRow,
): string | null => {
  const flowId = integrationRow.handoverResumeFlowId
  return typeof flowId === "string" && flowId.length > 0 ? flowId : null
}

/**
 * A handover that leaves the thread with another owner: best-effort fetch of
 * the channel's own expiry for it (Messenger: Meta's thread_owner expiration),
 * so the thread expires by the channel's clock rather than the blind 24h rule.
 * A channel without an owner-query handler (WhatsApp) resolves to a no-op. The
 * handover is already recorded, so a failure here is logged and never retried.
 */
const storeChannelThreadExpiry = async (props: {
  context: HandoverContext
  thread: ResolvedThread
  row: ContactInboxModel
}): Promise<void> => {
  const { context, thread, row } = props
  try {
    await syncThreadOwner({
      workspaceId: context.inbox.workspaceId,
      contactInbox: row,
      conversationId: thread.conversation.id,
    })
  } catch (err) {
    logger.warn(
      { err, contactInboxId: row.id },
      "Thread owner expiry sync after a handover failed; keeping the 24h fallback",
    )
  }
}

/**
 * Our own retry of an inferred hand-back whose event was already recorded (the
 * worker died before the response was queued): the thread no longer reads as
 * the AI's, but it was this very event that moved it, so recovery must go on.
 * An unrelated ownership change never matches (its time and previous owner differ).
 */
const isOwnRetry = (
  context: HandoverContext,
  contactInbox: ContactInboxModel,
): boolean =>
  context.job.isRetry &&
  contactInbox.threadControlLastEvent === context.event.event &&
  contactInbox.threadPreviousOwnerAppId === context.event.onlyIfOwnedByAppId &&
  contactInbox.threadControlUpdatedAt?.getTime() ===
    context.event.occurredAt.getTime()

const handleHandover = async (context: HandoverContext): Promise<void> => {
  const { inbox, event } = context
  const thread = await resolveHandoverThread(context)
  if (!thread) {
    return
  }
  if (
    event.onlyIfOwnedByAppId &&
    thread.contactInbox.threadOwnerAppId !== event.onlyIfOwnedByAppId &&
    !isOwnRetry(context, thread.contactInbox)
  ) {
    logger.debug(
      { contactInboxId: thread.contactInbox.id },
      "Dropping an inferred hand-back: the thread is not held by the app it names",
    )
    return
  }

  const { eventApplied, isRedelivery, row } =
    await threadControlService.recordEvent({
      workspaceId: inbox.workspaceId,
      inbox,
      contactInbox: thread.contactInbox,
      conversationId: thread.conversation.id,
      event: event.event,
      ownerRole: event.newOwnerRole,
      previousOwnerRole: event.previousOwnerRole,
      ownerAppId: event.newOwnerAppId ?? null,
      previousOwnerAppId: event.previousOwnerAppId ?? null,
      occurredAt: event.occurredAt,
      context: event.context,
      handoverNote: event.handoverNote,
    })

  if (eventApplied && row?.threadControlState === "standby") {
    await storeChannelThreadExpiry({ context, thread, row })
  }

  // Only a handover TO us starts the flow, and only the first time it lands:
  // a fresh Meta redelivery is applied (idempotently) but must not start it
  // again. Our own retry must, because the previous attempt may have died
  // between recording the event and enqueueing the flow; the flow's
  // deterministic job id dedupes an attempt that did enqueue it. Whether a
  // handover starts the flow is the CHANNEL's call (`resumeEligible`): it alone
  // knows which passes are "handed back to us" (e.g. an app-id check).
  const isFirstDelivery = !isRedelivery || context.job.isRetry
  if (eventApplied && isFirstDelivery && event.resumeEligible === true) {
    await startHandoverResponse({
      workspaceId: inbox.workspaceId,
      inboxId: inbox.id,
      integrationType: context.data.integrationType,
      pageResumeFlowId: readHandoverResumeFlowId(context.integrationRow),
      event,
      // Recorded on the row (the payload's previous owner, else the one the
      // row held), since Meta often omits it.
      previousOwnerAppId: row?.threadPreviousOwnerAppId ?? null,
      // The routing job's deterministic id: distinct per Meta event, stable on
      // redelivery and retry.
      eventKey: context.job.jobId ?? String(event.occurredAt.getTime()),
      thread,
    })
  }
}

/**
 * `threadControlEvent` job: the channel turns the routing webhook item into a
 * handover or a standby message; a standby message goes through the normal
 * inbound pipeline (which stores it and suppresses automation), a handover is
 * recorded and may start the hand-back response (resume flow / AI settings).
 */
export async function receiveThreadControlEvent(
  data: ThreadControlEventData,
  job: ThreadControlEventJobOptions = { isRetry: false },
): Promise<void> {
  const { integrationType, integrationIdentifier } = data

  const { inbox, integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )
  const integration = allIntegrations[integrationType]
  if (!integration) {
    throw new SdkException(
      `No integration registered for channel: ${integrationType}`,
    )
  }
  if (
    !integration.hasChannelHandler("conversation", "receiveThreadControlEvent")
  ) {
    logger.debug(
      { integrationType },
      "Channel has no receiveThreadControlEvent handler; dropping",
    )
    return
  }

  const ctx = await buildContext({
    workspaceId: inbox.workspaceId,
    integrationType,
    integration: integrationRow,
  })
  const result: ThreadControlWebhookResult | null =
    await integration.runChannelHandler(
      "conversation",
      "receiveThreadControlEvent",
      { ctx, data },
    )
  if (!result) {
    logger.debug(
      { integrationType, integrationIdentifier },
      "Routing event ignored by the channel (routing off or malformed)",
    )
    return
  }

  const context: ResultHandlerContext = { data, inbox, integrationRow, job }
  switch (result.kind) {
    case "standbyMessage":
      await receiveStandbyMessage(result, context)
      return
    case "handover":
      await handleHandover({ ...context, event: result.event })
      return
    case "handoverRequest":
      // A partner asking for the thread changes no ownership; ack only.
      logger.debug(
        { integrationType, integrationIdentifier },
        "Thread-control request ignored",
      )
      return
    case "appRoles":
      logger.info(
        {
          integrationType,
          integrationIdentifier,
          accountId: result.event.accountId,
          roles: result.event.roles,
        },
        "Thread-control receiver roles received",
      )
      return
    default: {
      // Exhaustiveness guard: a new result kind is a compile error here.
      const _exhaustive: never = result
      logger.warn({ result: _exhaustive }, "Unhandled thread-control result")
    }
  }
}

type ResultHandlerContext = Omit<HandoverContext, "event">

/**
 * Same pipeline as an owner delivery: stores the message, suppresses
 * automation. A call-permission answer is still recorded (account state, not
 * automation), exactly as the owner path in `worker.ts` does. When the AI
 * agent holds the thread while the workspace's AI automation is not running,
 * the customer's message also queues a take-back (see `ai-handover-take-back`).
 * It reads the stored standby copy, not only a new message, so a retry after a
 * failed standby write still records it (the reply upsert is idempotent).
 */
const receiveStandbyMessage = async (
  result: Extract<ThreadControlWebhookResult, { kind: "standbyMessage" }>,
  { data, inbox }: ResultHandlerContext,
): Promise<void> => {
  const received = await receiveMessage({
    integrationType: data.integrationType,
    integrationIdentifier: data.integrationIdentifier,
    payload: result.receivePayload,
  })
  if (!received?.standbyCopy) {
    return
  }
  // A standby postback or quick reply is never a call-permission answer; the
  // take-back below still applies to a replayable quick reply.
  if (!(received.postbackAction || received.quickReplyAction)) {
    await recordWhatsappCallPermissionReply({
      workspaceId: received.conversation.workspaceId,
      message: received.standbyCopy,
    })
  }
  // The AI agent holds the thread but the Page's AI automation is not
  // running: take it back and let the bot answer this message.
  await enqueueAiHandoverTakeBackIfDue({
    workspaceId: received.conversation.workspaceId,
    inboxId: inbox.id,
    integrationType: data.integrationType,
    integrationIdentifier: data.integrationIdentifier,
    ownerReplayPayload: result.ownerReplayPayload,
    aiAgentAppId: result.aiAgentAppId,
    standbyCopy: received.standbyCopy,
  })
}

/**
 * `threadControlAction` job (archive auto-release). The thread is re-read
 * first: a delayed job must not release on the channel a thread that a newer
 * event has since reacquired, handed over or expired (the enqueue-time
 * `threadControlUpdatedAt` must still match, so a reacquired ownership is not
 * released). A rejection that a retry
 * cannot fix (we no longer own the thread, the channel refuses the call, the
 * contact is gone) is logged and the job completes; a retryable error rethrows
 * so BullMQ retries.
 */
export async function releaseOwnedThread(
  data: IntegrationJobThreadControlAction["data"],
): Promise<void> {
  const current = await threadControlService.resolveCurrentState({
    workspaceId: data.workspaceId,
    contactInboxId: data.contactInboxId,
  })
  if (current?.state !== "owned") {
    logger.info(
      {
        contactInboxId: data.contactInboxId,
        currentState: current?.state ?? null,
      },
      "Thread release after archive skipped: the thread is no longer owned",
    )
    return
  }

  // Ownership was lost and reacquired since the archive: the job sees `owned`
  // but it is a NEW ownership that must not be released. A job queued before
  // the version was carried (`undefined`) keeps the owned-only check.
  if (
    data.threadControlUpdatedAt !== undefined &&
    (current.threadControlUpdatedAt?.toISOString() ?? null) !==
      data.threadControlUpdatedAt
  ) {
    logger.info(
      { contactInboxId: data.contactInboxId },
      "Thread release after archive skipped: ownership changed since the archive",
    )
    return
  }

  // The conversation may have been unarchived since this release was queued; a
  // release only applies while it is still archived (a re-archive is fine).
  // Read uncached so a just-written unarchive is seen even if cache
  // invalidation lagged.
  const conversation = await conversationService.findByUncached({
    where: { id: data.conversationId, workspaceId: data.workspaceId },
  })
  if (!conversation || conversation.archivedAt == null) {
    logger.info(
      { contactInboxId: data.contactInboxId },
      "Thread release after archive skipped: the conversation is no longer archived",
    )
    return
  }

  try {
    await requestThreadControlAction({
      workspaceId: data.workspaceId,
      contactInboxId: data.contactInboxId,
      conversationId: data.conversationId,
      action: data.action,
      // Re-checked inside requestAction after it re-reads the row, before the
      // channel call: a reacquisition between the two reads is never released.
      expectedThreadControlUpdatedAt: current.threadControlUpdatedAt,
    })
  } catch (err) {
    if (isPermanentThreadControlFailure(err)) {
      logger.warn(
        { err, contactInboxId: data.contactInboxId },
        "Thread release after archive was rejected; not retrying",
      )
      return
    }
    throw err
  }
}
