import { aiHandoverSettingsService, flowService } from "@chatbotx.io/business"
import { parseAiHandoverChannel } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { ThreadControlWebhookEvent } from "@chatbotx.io/sdk"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { handoffExecutorService } from "../../trigger/services/handoff-executor.service"

type HandoverResponseProps = {
  workspaceId: string
  /** The Page the hand-back arrived on; its AI hand-over card decides the response. */
  inboxId: string
  integrationType: string
  /** The Page/number's own resume flow, when it has one. */
  pageResumeFlowId: string | null
  event: Pick<ThreadControlWebhookEvent, "aiAgentAppId">
  /** Identifies this hand-back event, so a redelivery or retry never answers twice. */
  eventKey: string
  /** The owner this hand-back replaced: the payload's, else the one the row held. */
  previousOwnerAppId: string | null
  thread: {
    contactInbox: ContactInboxModel
    conversation: ConversationModel
  }
}

const isStartableFlow = async (
  flowId: string,
  workspaceId: string,
): Promise<boolean> => {
  const flow = await flowService.findActiveById({ id: flowId, workspaceId })
  if (flow?.currentVersionId) {
    return true
  }
  logger.warn(
    { flowId, workspaceId },
    "Handover resume flow is missing or inactive; skipping",
  )
  return false
}

const enqueueResumeFlow = async (
  props: HandoverResponseProps,
  flowId: string,
): Promise<void> => {
  const { contactInbox, conversation } = props.thread
  await integrationQueue.add(
    IntegrationJobAction.sendFlow,
    {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        flowId,
        origin: "channel",
      },
    },
    {
      jobId: `thread-resume-${contactInbox.id}-${props.eventKey}`,
    },
  )
}

/**
 * Enqueues the configured return message with the contact's variables already
 * resolved. A resolution failure skips the message (logged): the chat send path
 * would otherwise deliver a raw `{{placeholder}}` to the customer.
 */
const enqueueReturnMessage = async (
  props: HandoverResponseProps,
  text: string,
): Promise<void> => {
  const { contactInbox, conversation } = props.thread
  let resolved: { text: string }
  try {
    resolved = await resolveContactVariablesDeep(
      conversation.contactId,
      { text },
      { contactInbox: contactInbox.id, conversation },
    )
  } catch (err) {
    logger.warn(
      { err, contactInboxId: contactInbox.id },
      "Could not resolve the hand-back return message variables; skipping it",
    )
    return
  }
  await chatQueue.add(
    ChatJobAction.sendChatMessage,
    {
      type: ChatJobAction.sendChatMessage,
      data: { conversation, contactInbox, text: resolved.text },
    },
    {
      jobId: `thread-resume-message-${contactInbox.id}-${props.eventKey}`,
    },
  )
}

/** Hand-backs from the channel's AI agent: the Page's AI settings, when active. */
const resolveAiHandbackSettings = async (props: HandoverResponseProps) => {
  const { aiAgentAppId } = props.event
  if (!aiAgentAppId || props.previousOwnerAppId !== aiAgentAppId) {
    return null
  }
  if (!parseAiHandoverChannel(props.integrationType)) {
    return null
  }
  return await aiHandoverSettingsService.findActive({
    workspaceId: props.workspaceId,
    inboxId: props.inboxId,
  })
}

/**
 * What a hand-back to this app starts, once per applied resume-eligible
 * handover. A hand-back FROM the AI agent while the Page's AI hand-over automation is
 * active runs the AI hand-over card's flow, else its return message (when that flow
 * cannot run), and may pause the bot for a human; the Page's
 * `handoverResumeFlowId` is for other partners only. Inactive or unconfigured
 * automation, and any other partner, behave exactly as before. Job ids derive from the
 * event, so a redelivery or retry never answers twice; a missing or inactive
 * flow is logged and skipped, never fatal.
 */
export async function startHandoverResponse(
  props: HandoverResponseProps,
): Promise<void> {
  const settings = await resolveAiHandbackSettings(props)
  // One flow decides: the AI hand-over card's while it applies, else the Page's own.
  const flowId = settings ? settings.gotoFlowId : props.pageResumeFlowId
  let isFlowStarted = false
  if (flowId && (await isStartableFlow(flowId, props.workspaceId))) {
    await enqueueResumeFlow(props, flowId)
    isFlowStarted = true
  }

  if (!settings) {
    return
  }
  if (!isFlowStarted && settings.returnMessage) {
    await enqueueReturnMessage(props, settings.returnMessage)
  }
  if (settings.pauseBotWaitingForStaff) {
    // The guarded handoff: pauses the bot only while it is on and then emits
    // the transferred-to-human trigger, webhook and analytics every other
    // bot-pause path emits (so staff notifications still fire).
    await handoffExecutorService.execute({
      workspaceId: props.workspaceId,
      contactId: props.thread.conversation.contactId,
      conversationId: props.thread.conversation.id,
      channel: props.integrationType,
      reason: "ai_agent_handback",
      source: "thread_control_handback",
    })
  }
}
