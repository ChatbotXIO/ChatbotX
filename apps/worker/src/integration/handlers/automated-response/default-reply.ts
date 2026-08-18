import { defaultReplyThrottleService, flowService } from "@chatbotx.io/business"
import type { DefaultReplyFrequency } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  type BotResponseTrackingContext,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

/**
 * Result of {@link triggerDefaultReplyFlow}:
 * - `triggered` — the flow was enqueued.
 * - `throttled` — a flow is configured and valid, but the workspace's
 *   activation-frequency window is still open for this contact/channel.
 * - `skipped` — no flow is configured, or the configured flow is invalid /
 *   inactive (never consumes a throttle window).
 */
export const defaultReplyTriggerResults = [
  "triggered",
  "throttled",
  "skipped",
] as const
export type DefaultReplyTriggerResult =
  (typeof defaultReplyTriggerResults)[number]

export async function triggerDefaultReplyFlow(props: {
  workspaceId: string
  defaultReplyFlowId: string | null | undefined
  defaultReplyFrequency: DefaultReplyFrequency
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  trackingContext?: BotResponseTrackingContext
}): Promise<DefaultReplyTriggerResult> {
  const {
    workspaceId,
    defaultReplyFlowId,
    defaultReplyFrequency,
    conversation,
    contactInbox,
    trackingContext,
  } = props

  if (!defaultReplyFlowId) {
    return "skipped"
  }

  const flow = await flowService.findBy({
    workspaceId,
    id: defaultReplyFlowId,
  })

  if (!(flow?.active && flow.currentVersionId)) {
    logger.warn(
      { workspaceId, defaultReplyFlowId },
      "[default-reply] configured default reply flow is missing, inactive, or has no published version",
    )
    return "skipped"
  }

  const claim = await defaultReplyThrottleService.tryAcquire({
    workspaceId,
    contactInboxId: contactInbox.id,
    frequency: defaultReplyFrequency,
  })
  if (claim === "denied") {
    logger.debug(
      { workspaceId, contactInboxId: contactInbox.id, defaultReplyFrequency },
      "[default-reply] throttled: activation window still open for this contact",
    )
    return "throttled"
  }

  try {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        flowId: flow.id,
        origin: webhookChannelOrigin(),
        trackingContext,
      },
    })
  } catch (error) {
    // Roll back only a claim we actually own — a `bypassed` claim (allTime
    // or Redis fail-open) has no key of ours, and deleting the bare key
    // could erase a window claimed by a concurrent worker.
    if (claim === "acquired") {
      await defaultReplyThrottleService.release({
        workspaceId,
        contactInboxId: contactInbox.id,
      })
    }
    throw error
  }

  return "triggered"
}
