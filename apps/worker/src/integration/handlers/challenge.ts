import type { ConversationStepChallenge } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import type { StepInputResolutionReason } from "@chatbotx.io/flow-config"
import { SdkException } from "@chatbotx.io/sdk"
import type { IntegrationJobRunChallenge } from "@chatbotx.io/worker-config"
import { detectConversationAndContactInbox } from "../../lib/db"
import { runStepsAndQuickReplies } from "./flow"
import { runQuickReplyChallenge } from "./quick-reply-resume"
import {
  buildStepChallengeVariables,
  resolveStepChallengeTarget,
  type StepChallengeTarget,
} from "./step-challenge-target"

type RunStepChallengeProps = {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  challenge: ConversationStepChallenge
  /** Contact message that triggered the run; absent for a timer. */
  messageId?: string
  messageCreatedAt?: Date
  startedByContactMessage: boolean
  /** Set when the run ends the input without a typed answer. */
  resolutionReason?: StepInputResolutionReason
  triggerHandler: string
  /**
   * Called instead of failing when the flow, node or step is gone. Without it
   * the error propagates so the job retries.
   */
  onTargetUnavailable?: (error: SdkException) => Promise<void>
}

async function tryResolveStepChallengeTarget(
  props: Parameters<typeof resolveStepChallengeTarget>[0],
  onTargetUnavailable: RunStepChallengeProps["onTargetUnavailable"],
): Promise<StepChallengeTarget | undefined> {
  try {
    return await resolveStepChallengeTarget(props)
  } catch (error) {
    if (onTargetUnavailable && error instanceof SdkException) {
      await onTargetUnavailable(error)
      return
    }
    throw error
  }
}

/**
 * Re-enters a step from its pending challenge: a typed reply (`runChallenge`)
 * or a resolution without one (`runStepInputResolution`).
 */
export async function runStepChallenge(
  props: RunStepChallengeProps,
): Promise<void> {
  const {
    conversation,
    contactInbox,
    challenge,
    messageId,
    messageCreatedAt,
    startedByContactMessage,
    resolutionReason,
    triggerHandler,
    onTargetUnavailable,
  } = props

  const startTime = Date.now()
  try {
    const target = await tryResolveStepChallengeTarget(
      { challenge, workspaceId: conversation.workspaceId },
      onTargetUnavailable,
    )
    if (!target) {
      return
    }
    const { flowVersion, useLatestFlowVersion, nodeId, details } = target

    const variables = buildStepChallengeVariables(challenge)
    if (resolutionReason) {
      variables.conversation.challengeResolution = {
        name: "challengeResolution",
        type: "string",
        value: resolutionReason,
      }
    }

    await runStepsAndQuickReplies({
      conversation,
      contactInbox,
      flowVersion,
      useLatestFlowVersion,
      details,
      targetType: "node",
      targetId: nodeId,
      targetNodeId: nodeId,
      startFromStepId: challenge.data.stepId,
      ctx: { variables },
      triggerMessageId: messageId,
      triggerMessageCreatedAt: messageCreatedAt,
      startedByContactMessage,
      appointmentId: challenge.data.appointmentId,
    })

    if (messageId) {
      emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        channel: contactInbox.channel,
        inboxId: contactInbox.inboxId,
        messageId,
        occurredAt: new Date(),
        hasResponse: true,
        responseType: "flow",
        routeType: "flow",
        result: "success",
        aiProvider: "none",
        metadata: {
          latency: Date.now() - startTime,
          flowId: challenge.data.flowId,
          triggerContext: {
            triggerSource: "worker",
            triggerHandler,
            triggerType: "challenge_step",
          },
        },
      })
    }
  } catch (error) {
    if (messageId) {
      emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        channel: contactInbox.channel,
        inboxId: contactInbox.inboxId,
        messageId,
        occurredAt: new Date(),
        hasResponse: false,
        responseType: "flow",
        routeType: "flow",
        result: "fallback",
        aiProvider: "none",
        metadata: {
          latency: Date.now() - startTime,
          flowId: challenge.data.flowId,
          fallbackReason: "handler_error_to_fallback",
          triggerContext: {
            triggerSource: "worker",
            triggerHandler,
            triggerType: "challenge_step_failed",
          },
        },
      })
    }
    throw error
  }
}

export async function runChallenge(data: IntegrationJobRunChallenge["data"]) {
  const {
    conversationId,
    contactInboxId,
    challenge,
    messageId,
    messageCreatedAt,
  } = data

  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId,
      contactInboxId,
    })

  if (challenge.type === "quickReply") {
    await runQuickReplyChallenge({ conversation, contactInbox, challenge })
    return
  }
  if (challenge.type !== "step") {
    return
  }

  await runStepChallenge({
    conversation,
    contactInbox,
    challenge,
    messageId,
    messageCreatedAt,
    startedByContactMessage: true,
    triggerHandler: "runChallenge",
  })
}
