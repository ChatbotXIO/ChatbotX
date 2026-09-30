import {
  buildContext,
  conversationService,
  flowService,
  threadControlService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { requestThreadControlAction } from "@chatbotx.io/channel-registry/thread-control"
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
  ChannelError,
  SdkException,
  type ThreadControlWebhookEvent,
  type ThreadControlWebhookResult,
} from "@chatbotx.io/sdk"
import {
  IntegrationJobAction,
  type IntegrationJobThreadControlAction,
  type IntegrationJobThreadControlEvent,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  allIntegrations,
  type IntegrationRow,
  integrationService,
} from "../../services/integrations"
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
   * True when BullMQ retries this job after a failed attempt. A retry of a
   * handover whose event already landed (it failed after `recordEvent`, e.g.
   * the resume-flow enqueue threw) reads as a redelivery, but must still start
   * the flow; the flow's deterministic job id keeps that exactly-once.
   */
  isRetry: boolean
}

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
      contactId: existing.contactId,
      sourceId: null,
    })
    return { contactInbox: existing, conversation }
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
 * Starts the workspace's handover flow, once per applied `control_passed`. The
 * job id is derived from the event, so a redelivered handover cannot start the
 * flow twice; a deleted or inactive flow is logged and skipped, never fatal.
 */
const startHandoverResumeFlow = async (props: {
  context: HandoverContext
  thread: ResolvedThread
}): Promise<void> => {
  const { context, thread } = props
  const flowId = readHandoverResumeFlowId(context.integrationRow)
  if (!flowId) {
    return
  }

  const flow = await flowService.findActiveById({
    id: flowId,
    workspaceId: context.inbox.workspaceId,
  })
  if (!flow?.currentVersionId) {
    logger.warn(
      { flowId, integrationId: context.integrationRow.id },
      "Handover resume flow is missing or inactive; skipping",
    )
    return
  }

  await integrationQueue.add(
    IntegrationJobAction.sendFlow,
    {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: thread.conversation.id,
        contactInboxId: thread.contactInbox.id,
        flowId,
        origin: "channel",
      },
    },
    {
      jobId: `thread-resume-${thread.contactInbox.id}-${context.event.occurredAt.getTime()}`,
    },
  )
}

const handleHandover = async (context: HandoverContext): Promise<void> => {
  const { inbox, event } = context
  const thread = await resolveHandoverThread(context)
  if (!thread) {
    return
  }

  const { eventApplied, isRedelivery } = await threadControlService.recordEvent(
    {
      workspaceId: inbox.workspaceId,
      inbox,
      contactInbox: thread.contactInbox,
      conversationId: thread.conversation.id,
      event: event.event,
      ownerRole: event.newOwnerRole,
      previousOwnerRole: event.previousOwnerRole,
      occurredAt: event.occurredAt,
      context: event.context,
      handoverNote: event.handoverNote,
    },
  )

  // Only a handover TO us starts the flow, and only the first time it lands:
  // a fresh Meta redelivery is applied (idempotently) but must not start it
  // again. Our own retry must, because the previous attempt may have died
  // between recording the event and enqueueing the flow; the flow's
  // deterministic job id dedupes an attempt that did enqueue it.
  const isFirstDelivery = !isRedelivery || context.job.isRetry
  if (eventApplied && isFirstDelivery && event.event === "controlPassed") {
    await startHandoverResumeFlow({ context, thread })
  }
}

/**
 * `threadControlEvent` job: the channel turns the routing webhook item into a
 * handover or a standby message; a standby message goes through the normal
 * inbound pipeline (which stores it and suppresses automation), a handover is
 * recorded and may start the resume flow.
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
 * automation), exactly as the owner path in `worker.ts` does. It reads the
 * stored standby copy, not only a new message, so a retry after a failed
 * standby write still records it (the reply upsert is idempotent).
 */
const receiveStandbyMessage = async (
  result: Extract<ThreadControlWebhookResult, { kind: "standbyMessage" }>,
  { data }: ResultHandlerContext,
): Promise<void> => {
  const received = await receiveMessage({
    integrationType: data.integrationType,
    integrationIdentifier: data.integrationIdentifier,
    payload: result.receivePayload,
  })
  if (!received?.standbyCopy) {
    return
  }
  if (received.postbackAction || received.quickReplyAction) {
    return
  }
  await recordWhatsappCallPermissionReply({
    workspaceId: received.conversation.workspaceId,
    message: received.standbyCopy,
  })
}

/**
 * `threadControlAction` job (archive auto-release). A rejection that a retry
 * cannot fix (we no longer own the thread, the channel refuses the call, the
 * contact is gone) is logged and the job completes; a retryable error rethrows
 * so BullMQ retries.
 */
export async function releaseOwnedThread(
  data: IntegrationJobThreadControlAction["data"],
): Promise<void> {
  try {
    await requestThreadControlAction({
      workspaceId: data.workspaceId,
      contactInboxId: data.contactInboxId,
      conversationId: data.conversationId,
      action: data.action,
    })
  } catch (err) {
    if (isPermanentReleaseFailure(err)) {
      logger.warn(
        { err, contactInboxId: data.contactInboxId },
        "Thread release after archive was rejected; not retrying",
      )
      return
    }
    throw err
  }
}

const isPermanentReleaseFailure = (err: unknown): boolean =>
  (err instanceof ChannelError && !err.isRetryable) ||
  err instanceof ChatbotXException
