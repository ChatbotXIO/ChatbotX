import type { ConversationStepChallenge } from "@chatbotx.io/database/partials"
import type { FlowNode } from "@chatbotx.io/flow-config"
import { initVariables, SdkException, type Variables } from "@chatbotx.io/sdk"
import { detectFlowVersion } from "../../lib/db"
import type { runStepsAndQuickReplies } from "./flow"

export type StepChallengeTarget = {
  flowVersion: Awaited<ReturnType<typeof detectFlowVersion>>["flowVersion"]
  useLatestFlowVersion: boolean
  nodeId: string
  details: Parameters<typeof runStepsAndQuickReplies>[0]["details"]
}

/**
 * Finds the flow version, node and step a pending step challenge points at.
 * Throws `SdkException` when any of them is gone (flow republished or edited
 * since the question was asked); callers decide whether that retries or
 * drops the challenge.
 */
export async function resolveStepChallengeTarget(props: {
  challenge: ConversationStepChallenge
  workspaceId: string
}): Promise<StepChallengeTarget> {
  const { challenge, workspaceId } = props
  const { flowVersion, useLatestFlowVersion } = await detectFlowVersion({
    flowId: challenge.data.flowId,
    flowVersionId: challenge.data.flowVersionId,
    workspaceId,
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

  return {
    flowVersion,
    useLatestFlowVersion,
    nodeId: targetNode.id,
    details: targetNode.data.details,
  }
}

/**
 * Runtime variables a step reads to resume from its pending challenge. The
 * deadline origin and id only exist on challenges written by current code.
 */
export function buildStepChallengeVariables(
  challenge: ConversationStepChallenge,
): Variables {
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
  if (challenge.data.startedAt) {
    variables.conversation.challengeStartedAt = {
      name: "challengeStartedAt",
      type: "date",
      value: challenge.data.startedAt,
    }
  }
  if (challenge.data.challengeId) {
    variables.conversation.challengeId = {
      name: "challengeId",
      type: "string",
      value: challenge.data.challengeId,
    }
  }
  return variables
}
