import { flowService } from "@chatbotx.io/business"
import { startExternalStepActionSchema } from "@chatbotx.io/flow-config"
import baseLogger from "@chatbotx.io/logger"
import {
  IntegrationJobAction,
  type IntegrationJobRunFlowNode,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { buildSendFlowJob } from "../../../integration/handlers/send-flow-job"
import type { ActionExecutionContext } from "../../types"
import { skipped, succeeded, type TriggerActionHandler } from "./types"

/**
 * An inbound-webhook action may run again after a retry that lost its
 * checkpoint; a deterministic job id keeps the flow from being sent twice.
 * Trigger runs keep their existing, unkeyed behaviour.
 */
const enqueueSendFlow = async (
  sendFlowJob: IntegrationJobRunFlowNode,
  context: ActionExecutionContext,
): Promise<void> => {
  if (context.source.kind === "inboundWebhook" && context.occurrenceKey) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, sendFlowJob, {
      jobId: `send-flow-${context.occurrenceKey.replaceAll(":", "-")}`,
    })
    return
  }
  await integrationQueue.add(IntegrationJobAction.sendFlow, sendFlowJob)
}

export const startAnotherFlow: TriggerActionHandler = async ({
  context,
  conversation,
  scope,
}) => {
  const { action, contactId, source, workspaceId } = context
  const contactInbox = await scope.getContactInbox()
  if (!contactInbox) {
    baseLogger.warn(
      `No contact inbox found for contact ${contactId}, skipping startAnotherFlow action`,
    )
    return skipped("noContactInbox")
  }

  const flowId = action.flowId as string
  if (context.decisionFlowOrigin?.flowId === flowId) {
    baseLogger.info(
      { flowId, source },
      "Skipping Decision-origin Flow self-loop",
    )
    return succeeded
  }
  const flow = await flowService.findActiveById({
    workspaceId,
    id: flowId,
  })

  if (!flow?.currentVersionId) {
    baseLogger.warn(
      `Flow ${flowId} not found or not active, skipping startAnotherFlow action`,
    )
    return skipped("flowInactive")
  }

  const sendFlowJob = buildSendFlowJob({
    conversationId: conversation,
    contactInboxId: contactInbox.id,
    flowId,
  })
  await enqueueSendFlow(sendFlowJob, context)
  return succeeded
}

/** Starts a flow at one of its nodes, reusing the flow step's node entry. */
export const startExternalStep: TriggerActionHandler = async ({
  context,
  conversation,
  scope,
}) => {
  const parsed = startExternalStepActionSchema.safeParse(context.action)
  if (!parsed.success) {
    return skipped("invalidAction")
  }
  const { flowId, nodeId } = parsed.data
  const { workspaceId, source } = context

  const contactInbox = await scope.getContactInbox()
  if (!contactInbox) {
    return skipped("noContactInbox")
  }
  if (context.decisionFlowOrigin?.flowId === flowId) {
    baseLogger.info(
      { flowId, source },
      "Skipping Decision-origin Flow self-loop",
    )
    return succeeded
  }

  const status = await flowService.resolveStartTarget({
    workspaceId,
    flowId,
    nodeId,
  })
  if (status !== "ready") {
    // The status names the reason: flowNotFound, flowInactive, flowNotPublished, nodeNotFound.
    return skipped(status)
  }

  await enqueueSendFlow(
    buildSendFlowJob({
      conversationId: conversation,
      contactInboxId: contactInbox.id,
      flowId,
      nodeId,
    }),
    context,
  )
  return succeeded
}
