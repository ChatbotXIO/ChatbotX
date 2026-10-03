import { conversationService } from "@chatbotx.io/business"
import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import {
  type ConversationAttributes,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import type { ConversationModel } from "@chatbotx.io/database/types"
import {
  computeQuickReplyFollowUpTriggerAt,
  type MetadataPayload,
  resolveActiveQuickReplySettings,
} from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"
import { scheduleSmartDelayResume } from "./smart-delay"

// This module must not import ./flow (directly or transitively): flow.ts
// imports it, so doing so would create a cycle.

const pendingQuickReplyChallenge = (additionalAttributes: unknown) => {
  const challenge = (additionalAttributes as ConversationAttributes | undefined)
    ?.challenge
  return challenge?.type === "quickReply" ? challenge : undefined
}

/**
 * Called right after a node's quick-reply carrier step has been sent. The
 * latest quick-reply node always supersedes an earlier one's pending retry and
 * other nodes' follow-ups. Nothing is armed for a flow an agent sent from the
 * inbox, or while the bot is paused — deciding here keeps the outcome
 * independent of when the inbox's `disableBot` lands. Never throws.
 */
export async function armQuickReplySettings(props: {
  workspaceId: string
  conversation: Pick<
    ConversationModel,
    "id" | "workspaceId" | "contactId" | "botEnabled" | "botResumeAt"
  >
  contactInboxId: string
  flowId: string
  flowVersionId: string | null
  nodeId: string
  details: unknown
  metadata?: MetadataPayload
  sendFrom?: "inbox"
}): Promise<void> {
  const conversationId = props.conversation.id
  try {
    const active = resolveActiveQuickReplySettings(props.details)
    const canArm =
      Boolean(active.retry || active.followUp) &&
      props.sendFrom !== "inbox" &&
      (await conversationService.ensureActive(props.conversation))
    const retry = canArm ? active.retry : undefined

    // The challenge write and the cancel of other nodes' follow-ups touch
    // different rows, so they run together.
    const [armed] = await Promise.all([
      retry
        ? // Conditional on `botEnabled`: a pause landing after `ensureActive`
          // above must win, so nothing is armed on a handed-off conversation.
          conversationService.armQuickReplyChallenge({
            workspaceId: props.workspaceId,
            conversationId,
            challenge: {
              type: "quickReply",
              data: {
                flowId: props.flowId,
                flowVersionId: props.flowVersionId ?? undefined,
                nodeId: props.nodeId,
                attempts: 0,
                maxRetries: retry.maxRetries,
                sentAt: new Date(),
              },
            },
          })
        : conversationService
            .clearQuickReplyChallenge({
              workspaceId: props.workspaceId,
              conversationId,
            })
            .then(() => true),
      smartDelayService.cancelQuickReplyFollowUps({
        workspaceId: props.workspaceId,
        contactInboxId: props.contactInboxId,
        exceptNodeId: props.nodeId,
      }),
    ])
    const followUp = canArm && armed ? active.followUp : undefined

    if (followUp) {
      await scheduleSmartDelayResume({
        type: smartDelayTypes.enum.quickReplyFollowUp,
        triggerAt: computeQuickReplyFollowUpTriggerAt(followUp),
        workspaceId: props.workspaceId,
        flowId: props.flowId,
        flowVersionId: props.flowVersionId,
        conversationId,
        contactInboxId: props.contactInboxId,
        connectedNodeId: props.nodeId,
        stepId: followUp.id,
        metadata: props.metadata,
        sendFrom: props.sendFrom,
      })
    }
  } catch (error) {
    logger.warn(
      {
        err: error,
        nodeId: props.nodeId,
        conversationId,
      },
      "armQuickReplySettings: failed to arm quick reply settings",
    )
  }
}

/** A real node entry of another flow ends this contact's pending state. Never throws. */
export async function clearQuickReplyPendingOnFlowEntry(props: {
  workspaceId: string
  conversation: { id: string; additionalAttributes: unknown }
  contactInboxId: string
  flowId: string
}): Promise<void> {
  try {
    const challenge = pendingQuickReplyChallenge(
      props.conversation.additionalAttributes,
    )
    await Promise.all([
      challenge && challenge.data.flowId !== props.flowId
        ? conversationService.clearQuickReplyChallenge({
            workspaceId: props.workspaceId,
            conversationId: props.conversation.id,
            exceptFlowId: props.flowId,
          })
        : undefined,
      smartDelayService.cancelQuickReplyFollowUps({
        workspaceId: props.workspaceId,
        contactInboxId: props.contactInboxId,
        exceptFlowId: props.flowId,
      }),
    ])
  } catch (error) {
    logger.warn(
      { err: error, conversationId: props.conversation.id },
      "clearQuickReplyPendingOnFlowEntry: failed to clear pending state",
    )
  }
}

/** Any tapped button/quick reply ends a pending retry. Never throws. */
export async function clearQuickReplyChallengeOnTap(props: {
  workspaceId: string
  conversation: { id: string; additionalAttributes: unknown }
}): Promise<void> {
  if (!pendingQuickReplyChallenge(props.conversation.additionalAttributes)) {
    return
  }
  try {
    await conversationService.clearQuickReplyChallenge({
      workspaceId: props.workspaceId,
      conversationId: props.conversation.id,
    })
  } catch (error) {
    logger.warn(
      { err: error, conversationId: props.conversation.id },
      "clearQuickReplyChallengeOnTap: failed to clear challenge",
    )
  }
}
