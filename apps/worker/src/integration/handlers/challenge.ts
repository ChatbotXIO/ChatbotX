import { emit } from "@chatbotx.io/event-bus"
import type { FlowNode } from "@chatbotx.io/flow-config"
import { initVariables, SdkException } from "@chatbotx.io/sdk"
import type { IntegrationJobRunChallenge } from "@chatbotx.io/worker-config"
import {
  detectConversationAndContactInbox,
  detectFlowVersion,
} from "../../lib/db"
import { logger } from "../../lib/logger"
import { runStepsAndQuickReplies } from "./flow"

export async function runChallenge(data: IntegrationJobRunChallenge["data"]) {
  const { conversationId, contactInboxId, challenge, messageId } = data

  if (challenge.type !== "step") {
    return
  }

  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId,
      contactInboxId,
    })

  const startTime = Date.now()
  try {
    const { flowVersion, useLatestFlowVersion } = await detectFlowVersion({
      flowId: challenge.data.flowId,
      flowVersionId: challenge.data.flowVersionId,
      workspaceId: conversation.workspaceId,
    })

    const targetNode = (flowVersion.nodes as unknown as FlowNode[]).find(
      (node) => node.id === challenge.data.nodeId,
    )
    if (!targetNode) {
      throw new SdkException("Target node not found")
    }

    if (!("steps" in targetNode.data.details)) {
      throw new SdkException("Target node does not have steps")
    }
    const targetStepIdx = targetNode.data.details.steps.findIndex(
      (step) => step.id === challenge.data.stepId,
    )
    if (targetStepIdx === -1) {
      throw new SdkException("Target step not found")
    }

    const variables = initVariables()
    variables.conversation.challengeAttempts = {
      name: "challengeAttempts",
      type: "number",
      value: challenge.data.attempts,
    }
    variables.conversation.challengeLastAttemptAt = {
      name: "challengeLastAttemptAt",
      type: "date",
      value: challenge.data.lastAttemptAt,
    }

    await runStepsAndQuickReplies({
      conversation,
      contactInbox,
      flowVersion,
      useLatestFlowVersion,
      details: targetNode.data.details,
      targetType: "node",
      targetId: targetNode.id,
      startFromStepIndex: targetStepIdx,
      ctx: {
        variables,
      },
    })

    if (messageId) {
      emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
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
            triggerHandler: "runChallenge",
            triggerType: "challenge_step",
          },
        },
      }).catch((err) =>
        logger.error(err, "[runChallenge] Failed to emit bot_received"),
      )
    }
  } catch (error) {
    if (messageId) {
      emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
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
            triggerHandler: "runChallenge",
            triggerType: "challenge_step_failed",
          },
        },
      }).catch((err) =>
        logger.error(
          err,
          "[runChallenge] Failed to emit bot_received fallback",
        ),
      )
    }
    throw error
  }
}
