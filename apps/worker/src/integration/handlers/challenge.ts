import type { FlowNode } from "@aha.chat/flow-config"
import { SdkException } from "@aha.chat/sdk"
import type { IntegrationJobRunChallenge } from "@aha.chat/worker-config"
import { findConversationAndFlowVersion } from "../../lib/db"
import { flowStepHandlers } from "./step"

export async function runChallenge(data: IntegrationJobRunChallenge["data"]) {
  const { conversationId, challenge } = data

  if (challenge.type === "step") {
    const { conversation, flowVersion, useLatestFlowVersion } =
      await findConversationAndFlowVersion({
        conversationId,
        flowId: challenge.data.flowId,
        flowVersionId: challenge.data.flowVersionId,
      })

    // Find target node
    const targetNode = (flowVersion.nodes as unknown as FlowNode[]).find(
      (node) => node.id === challenge.data.nodeId,
    )
    if (!targetNode) {
      throw new SdkException("Target node not found")
    }

    // Find target step
    if (!("steps" in targetNode.data.details)) {
      throw new SdkException("Target node does not have steps")
    }
    const targetStepIdx = targetNode.data.details.steps.findIndex(
      (step) => step.id === challenge.data.stepId,
    )
    if (targetStepIdx === -1) {
      throw new SdkException("Target step not found")
    }

    const remainingSteps = targetNode.data.details.steps.slice(targetStepIdx)
    const targetStep = remainingSteps[0]

    flowStepHandlers[targetStep.stepType]?.({
      conversation,
      flowVersion,
      useLatestFlowVersion,
      targetType: "node",
      targetId: targetNode.id,
      step: targetStep,
      state: challenge.data,
    })
  }
}
